# Spec 1.2 — Report correctness: schema version, read-side dedup, staleness, `--since`

**Review findings:** DESIGN_REVIEW.md A4, A5 (Medium) + the schema-version slice of A1. **Effort:** S. **Depends on:** nothing. Touches the same files as spec 1.1 — if both are scheduled, land this one first (it is smaller), then 1.1 rebases on it.

## Goal

Three small fixes that make the report's numbers trustworthy and deliver an already-documented promise:

1. Stamp a schema version on every new event so future format evolution is cheap.
2. Dedupe by UUID at read time, so concurrent collectors can never double-count.
3. Add the staleness flag the README promises, plus a `--since` window.

## Background (current behavior)

- Events are deduped **only at write time** (`skills/rule-trace/scripts/lib/metrics.mjs:51-59`: read existing UUIDs, filter, append). Two concurrent writers — the live Stop hook firing while `parse-traces.mjs` backfills, or two agent sessions in one repo — can interleave read-then-append and both write the same UUID. `report.mjs` (`aggregate()`, line ~80) then counts the duplicate twice.
- Events carry no schema-version field.
- `report.mjs` tracks `lastSeen` per rule (line ~93-94) but the `flags` object (lines ~127-144) has no staleness entry, and there is no time filtering. `README.md:14` promises "dead, broad, skipped, or **stale** rules become visible."

## Requirements

### R1 — Schema version

- `eventFromAssistant()` (`lib/metrics.mjs`) adds `v: 1` as the first field of every event it builds.
- Readers must not require it (legacy events have none). Do not write migration code.

### R2 — Read-side dedup

In `report.mjs` `aggregate()`: before the counting loop, dedupe `events` by `uuid` — keep the **first** occurrence of each non-null UUID; events with `uuid == null` are all kept (they were never dedupable). Report the number of duplicates dropped in the JSON output as `duplicateEventsIgnored` (0 in the normal case) and mention it in the console summary only when > 0.

### R3 — Staleness flag

- New flag `flags.stale`: rules with `candidate > 0` whose `lastSeen` is older than a threshold. Entry shape: `{ id, lastSeen }`.
- Threshold: `--stale-days <n>`, default `30`. Rules with `candidate > 0` but `lastSeen === null` (all their events lacked timestamps) are **not** flagged stale (unknowable ≠ stale).
- "Now" is `new Date()` at report time (the report already stamps `generatedAt`).
- Dashboard: add a `Stale (…​)` section via the existing `list()` helper, positioned after "Dead rules", rendering `ID — last seen <date>`.

### R4 — `--since` window

- New flag `--since <ISO-8601 date>` on `report.mjs`. When set, aggregation only counts events whose `timestamp` is `>= since`. Events **without** a timestamp are excluded from a windowed run; report their count as `eventsOutsideWindowOrUndated` in the JSON so the exclusion is visible.
- `--since` composes with everything else (flags, staleness, coverage if spec 1.1 has landed).
- Invalid date → exit 1 with a clear message (match the fail-fast style of `scaffold-wiring.mjs:47-52`).

### R5 — Docs

- `README.md`: add `--stale-days` and `--since` to the report command block (`README.md:170`) and add `stale` to the dashboard-highlights list (`README.md:191-197`).
- `skills/rule-trace/SKILL.md` audit/report sections: add the stale flag to the flag list (line ~56).
- `skills/rule-trace/references/audit.md` §5 ("Read the usage flags"): add a bullet interpreting `stale` (rule used to matter, has not surfaced recently → repo changed, or trigger rotted → Revise or Remove).

## Acceptance criteria

1. A log containing the same UUID twice (hand-crafted duplicate lines) produces the same counts as a log containing it once, and `duplicateEventsIgnored === 1`.
2. New events written by both collectors carry `v: 1`; a mixed old/new log aggregates identically to before (additive field only).
3. A rule whose only events have timestamps 60 days old is listed in `flags.stale` with default settings, and is **not** listed with `--stale-days 90`.
4. A rule with `candidate > 0` and no timestamps anywhere is not in `flags.stale`.
5. `--since <date>` excludes older events from all counts, and undated events are excluded and counted in `eventsOutsideWindowOrUndated`.
6. `--since banana` exits 1 with a message naming the bad value.
7. The dashboard renders the Stale section (empty state shows "none" like the other sections).
8. `npm test` green.

## Tests to add

Extend the report-fixture pattern (`tests/rule-trace.test.mjs:395-439`): craft `traces.jsonl` fixtures with explicit timestamps for criteria 1, 3, 4, 5; assert on the parsed `report.json` (add `--out-json` to the invocation) rather than scraping stdout.

## Out of scope

- Coverage/untraced events (spec 1.1).
- Trend lines, per-session grouping, log rotation, or any change to the on-disk log beyond the additive `v` field.
- The fenced structured trace format (spec 3.1).

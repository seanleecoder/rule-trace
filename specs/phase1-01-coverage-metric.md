# Spec 1.1 — Trace-emission coverage metric

**Review finding:** DESIGN_REVIEW.md P1 (Critical). **Effort:** S. **Depends on:** nothing (but coordinate with 1.2, which touches the same files — if both run, land 1.2 first or rebase).

## Goal

Give the metrics pipeline a denominator. Today the system records only responses that *carry* a trace block, so "no rule was ever a candidate" is indistinguishable from "the agent stopped emitting traces." After this change, the report states what fraction of finished responses carried a trace, and warns when that fraction is too low to interpret the other flags.

## Background (current behavior)

- `skills/rule-trace/scripts/record-trace.mjs` is a Claude Code `Stop` hook. It reads the session transcript, walks **backward to the most recent main-agent assistant message that has a parseable trace block** (`record-trace.mjs:56-66`), records that one event, and silently records nothing when no traced message exists.
- Events are appended to `<metricsDir>/traces.jsonl` via `appendEvents()` in `skills/rule-trace/scripts/lib/metrics.mjs`, deduped by message UUID.
- `skills/rule-trace/scripts/report.mjs` aggregates all events into per-rule counts and flags (`deadRules`, `alwaysCandidateNeverApplied`, `lowRate`, `unwaivedMustGaps`, `unknownIds`). It has no concept of untraced responses.

## Requirements

### R1 — Record untraced Stops

In `record-trace.mjs`: instead of walking back to the last *traced* message, take the **last main-agent assistant message with non-empty visible text** (same `type === 'assistant' && isSidechain !== true` filter, using `assistantText()`):

- If it carries a trace block → build the event via `eventFromAssistant()` as today, and add `traced: true`.
- If it does not → append a minimal untraced event: `{ v: 1, uuid, sessionId, timestamp, source: 'claude-code', transcript, traced: false }` (no `candidate`/`applied`/`deviations` arrays).

Keep UUID dedup (untraced events dedupe identically), the `SubagentStop` guard, and the never-throw envelope. Add `traced: true` and `v: 1` to traced events in `eventFromAssistant()` (`lib/metrics.mjs:19-32`) so both collectors stamp them.

**Do not** change `parse-traces.mjs` to emit untraced events: offline transcripts contain many mid-turn assistant records, so backfilled untraced events would corrupt the denominator. Coverage is a live-hook metric. Add a code comment in `parse-traces.mjs` stating this.

### R2 — Coverage in the report

In `report.mjs`:

- Events where `traced === false` contribute nothing to per-rule counts (skip them in the counting loop) but count toward coverage.
- Compute coverage over events that carry a boolean `traced` field only (legacy events lack it and must not skew the ratio): `coverage = tracedCount / (tracedCount + untracedCount)`, `null` when the denominator is 0.
- Add to the JSON output: `coverage: { traced, untraced, rate }` (rate `null` when unknown).
- Add a `--min-coverage <0..1>` flag (default `0.2`). When `rate !== null && rate < minCoverage`, add `lowCoverage: true` inside the `coverage` object.

### R3 — Coverage in the dashboard

In `buildHtml()`:

- Add a stat tile: "trace coverage" showing `X%` (or `—` when `rate` is null) with a sub-label like "N of M responses traced".
- When `lowCoverage` is true, prepend a warning banner (reuse the existing `.note` style): coverage is below the threshold, so the dead-rule / low-rate flags below may reflect *missing traces*, not unused rules.
- Keep the honest framing: the convention intentionally omits traces on trivial/conversational responses, so 100% is not the target — the metric is a sanity/trend signal. One sentence of this in the banner or the existing note.

### R4 — Docs

- `README.md`: extend the "Counters And Dashboard" section with two or three sentences on coverage and the low-coverage guard; mention `--min-coverage` in the Commands section's report example.
- `skills/rule-trace/SKILL.md` "Counters" section: one sentence — the hook records untraced responses too, so the report can state coverage.
- `skills/rule-trace/references/ci-wiring.md` §3: mention that the live hook is what feeds coverage.

## Acceptance criteria

1. A Stop-hook invocation on a transcript whose final main-agent message has **no** trace appends exactly one `{traced:false}` event (verify with a crafted transcript fixture).
2. A Stop-hook invocation on a traced final message appends the full event with `traced: true` and `v: 1`.
3. Re-running the hook on the same transcript appends nothing (UUID dedup holds for untraced events).
4. `report.mjs` on a log of 6 traced + 4 untraced events reports `coverage.rate === 0.6` and no `lowCoverage`.
5. With `--min-coverage 0.7` on the same log, `coverage.lowCoverage === true` and the dashboard HTML contains the warning banner.
6. A legacy log (events without `traced`) reports `coverage.rate === null` and renders `—` — and per-rule counts are unchanged from v1.2.0 behavior (backward compat).
7. Untraced events never contribute to `candidate`/`applied` counts or any flag list.
8. `npm test` green.

## Tests to add (`tests/`)

- Hook behavior: spawn `record-trace.mjs` with a synthetic Stop payload (`transcript_path` pointing at a crafted JSONL fixture) for the traced, untraced, and re-run cases. Model the fixture records on the shapes `assistantText()` already handles (`lib/rules.mjs:267-276`).
- Report: fixture logs covering criteria 4–7 (extend the existing report test pattern at `tests/rule-trace.test.mjs:395-439`).

## Out of scope

- Any change to `parse-traces.mjs` semantics (comment only).
- Windowing/staleness (spec 1.2), structured trace format (spec 3.1).
- Gating CI or exiting non-zero on low coverage — report-level signal only.

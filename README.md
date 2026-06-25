# rule-traceability

Make AI-agent rule application **visible and auditable**.

Rules you load into a coding agent are *loaded* context — not *applied* context. A rule that was followed looks identical to one that was ignored. This skill closes that gap:

- **Stable rule IDs** anchored at markdown headings, indexed in a **catalog**.
- **Trace blocks** appended to relevant responses, disclosing which in-scope rules were *candidates* vs which were actually *applied* (plus deliberate *deviations*).
- **Usage counters** that aggregate those trace blocks across sessions, so the most valuable signal — the **diff between candidate and applied** — becomes quantitative. Dead rules, miscoped rules, and un-waived `MUST` gaps surface automatically.
- A **deterministic validator** that fails CI when a catalog ID stops resolving to a heading, when importers drift out of sync, or when a rule is missing required fields.

It's a portable, tool-agnostic [Agent Skill](https://skills.sh) — works in Claude Code, OpenCode, Codex, Cursor, and other agents — with four modes: **init** (scaffold a fresh repo), **migrate** (convert existing scattered rules into the traceable format), **audit** (maintain the rule set using usage data), and **report** (build the dashboard).

Background: [Making AI-agent rule application visible — stable IDs and trace blocks](https://seanleecoder.hashnode.dev/making-ai-agent-rule-application-visible-stable-ids-and-trace-blocks).

## Install

### Across all your agents (skills.sh — recommended)

```bash
npx skills add seanleecoder/rule-traceability
```

Installs into every detected agent at once (Claude Code → `.claude/skills/`, OpenCode/Codex/Cursor → `.agents/skills/`). Add `-g` for a global install, or `--copy` to copy instead of symlink. Update later with `npx skills update rule-traceability`.

### As a native Claude Code plugin

```text
/plugin marketplace add seanleecoder/rule-traceability
/plugin install rule-traceability@seanleecoder-skills
```

The plugin install additionally wires the live usage counter (a `Stop` hook) automatically — see [Counters](#counters).

### As a CLI in CI (no agent runtime needed)

```bash
npx github:seanleecoder/rule-traceability validate   # exit 1 on any rule-system error
```

## Quickstart

Once installed, ask your agent to use the skill — e.g. *"use rule-traceability to migrate this repo's rules"* or *"validate rule traceability"*. The skill routes to the right mode and reads its own reference docs.

The deterministic parts are plain Node (≥18, zero dependencies) and can be run directly:

```bash
# Validate the rule system (run from the repo root)
node <skill>/scripts/validate-rules.mjs            # or: npx github:seanleecoder/rule-traceability validate
# Backfill usage counts from saved transcripts, then build the dashboard
node <skill>/scripts/parse-traces.mjs
node <skill>/scripts/report.mjs                    # writes .agents/metrics/report.json + dashboard.html
```

## Counters

Trace blocks already carry candidate + applied IDs, so the data exists in transcripts — it just needs collecting. Two collectors share one append-only, UUID-deduped event log (`.agents/metrics/traces.jsonl`):

- **Offline (tool-agnostic):** `parse-traces.mjs` scans saved transcripts and appends any trace blocks. Re-runnable; retroactive. Point `--transcripts <dir>` at any agent's transcript store.
- **Live (Claude Code only):** the `Stop` hook in [`hooks/hooks.json`](hooks/hooks.json) records each finished response. You get it automatically with the **plugin** install. With a **skills.sh** install, add it manually — see the skill's `references/importer-wiring.md`.

`report.mjs` aggregates the log into per-rule candidate/applied/rate plus flag lists (dead rules, always-candidate-never-applied, low rate, un-waived `MUST` gaps, unknown/hallucinated IDs) and a self-contained `dashboard.html`.

> Counts are **self-reported** by the model — they record what it *claimed* it applied, not proof of compliance. Treat the dashboard as a review surface. A rule never surfaced as a candidate is invisible (false absence), so low totals early on are expected.

## Validate (CI)

`validate-rules.mjs` checks: every catalog ID resolves to a real heading; every heading is catalogued; no duplicate IDs; importers reference identical file sets (drift guard); required fields present (incl. `Severity` — pass `--no-severity` while migrating). Trace-lint mode (`--lint-file <path>`) flags cited IDs missing from the catalog. Exit 1 on errors.

## License

MIT © Sean Lee ([seanleecoder](https://github.com/seanleecoder))

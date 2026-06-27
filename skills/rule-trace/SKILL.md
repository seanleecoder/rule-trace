---
name: rule-trace
description: Make AI-agent rule application visible and auditable using stable rule IDs, a catalog, trace blocks, usage counters, and a deterministic validator. Use this whenever someone wants to add rule tracing to a repo, turn existing agent rules (CLAUDE.md, AGENTS.md, .cursorrules, .agents/, scattered docs) into a traceable ID-based format, track or count how often each rule is considered vs applied, audit which rules are noise or dead, validate that a rule catalog and its importers haven't drifted, or build a report/dashboard of rule usage. Triggers on phrases like "rule tracing", "trace which rules were applied", "stable rule IDs", "rules catalog", "parse my rules", "which rules never fire", "rule usage metrics", or wiring rules across multiple agent tools.
version: 1.0.0
license: MIT
---

# Rule Trace

Rules loaded into an agent are *loaded* context, not *applied* context — a rule that was followed looks identical to one that was ignored. This skill closes that gap. Every rule gets a **stable ID** anchored at a markdown heading; an agent that does real work appends a **trace block** disclosing which in-scope rules it considered (*candidates*) versus which it actually let constrain the work (*applied*); a **catalog** indexes every ID; deterministic **scripts** validate the system and **count** candidate-vs-applied usage across sessions so dead and miscoped rules become visible.

The most valuable signal is the **diff between candidates and applied** — a rule that is always a candidate but never applied is noise, miscoped, or being ignored.

## Pick a mode

Read the user's intent and route to one mode. Each links the reference you should read before acting.

| Intent | Mode | Read first |
| --- | --- | --- |
| Add rule tracing to a repo that has none | **init** | `references/convention.md`, `references/importer-wiring.md` |
| Convert existing/scattered rules into the traceable format | **migrate** | `references/migration-guide.md`, `references/rule-anatomy.md` |
| Maintain/clean an existing rule set, using usage data as evidence | **audit** | `references/catalog-format.md`, plus the report (below) |
| Count usage and build the dashboard | **report** | this file's "Counters" section |

The deterministic scripts live in `scripts/` and are portable (Node ≥ 18, no dependencies). They resolve repo layout from an optional `.agents/rule-trace.config.json` (see `references/catalog-format.md`), falling back to the conventional layout. Run them from the target repo root, or pass `--root <dir>`.

## init — scaffold a fresh system

Goal: drop the convention in, create an empty catalog, seed one example rule, and wire the importers.

1. Inspect the repo for existing agent entry points: `CLAUDE.md`, `AGENTS.md`, `.opencode/opencode.json`, `.cursorrules`, `.github/copilot-instructions.md`. If real rules already exist there, switch to **migrate** instead — don't scaffold over content.
2. Copy `templates/rule-trace.md.tmpl` → `.agents/rule-trace.md`, `templates/rules-catalog.md.tmpl` → `.agents/rules-catalog.md`, and `templates/rule-file.md.tmpl` → `.agents/rules/root.md` (keep the one example rule so the layout is concrete).
3. Wire every agent entry point present to load the rule files, in lockstep — see `references/importer-wiring.md`. The non-negotiable invariant: **all importers reference the identical set of files.** The validator enforces this. If the repo uses only one agent tool, set `importers` in `.agents/rule-trace.config.json` to just that entry so the validator doesn't warn about the absent ones.
4. Run `node <skill>/scripts/validate-rules.mjs --root <repo>` and fix anything it reports.
5. Optionally scaffold the operational wiring (a CI job that runs the validator, a metrics `.gitignore`, the Claude Code Stop hook) with `node <skill>/scripts/scaffold-wiring.mjs --root <repo>` — it's non-destructive. Offer this; don't force it.

## migrate — turn existing rules into traceable form

This is the high-value mode and the part that needs judgment — extraction is not mechanical. Follow `references/migration-guide.md` in full. In short:

1. **Gather** every source of existing rules (the entry points above, plus READMEs/docs the user points to).
2. **Split** prose into discrete, individually-citable rules. One rule = one enforceable idea.
3. **Assign IDs** by layer: repo-wide (`ROOT-`), topic/area (e.g. `TEST-`, `STYLE-`), package-local (`PKG-<PKG>-<AREA>-`). Number sequentially per prefix. IDs are immutable once published.
4. **Rewrite** each rule into the anatomy in `references/rule-anatomy.md` (Scope / Applies when / Severity / Rule).
5. **Build** the catalog — run `node <skill>/scripts/generate-catalog.mjs --root <repo> --write` to derive it from the headings (it preserves any summaries you've already written), then **wire** the importers (`references/importer-wiring.md`). See `references/catalog-format.md`.
6. **Validate**: `node <skill>/scripts/validate-rules.mjs --root <repo>` must pass.

Extraction is agent judgment; the validator is the deterministic check on the output. Don't invent rules the sources don't support.

## audit — maintain the rule set with evidence

Maintain the rules by combining repo state, *quantitative* usage evidence, and the current session into concrete edits. **Follow `references/audit.md` in full** — it has the method, parameters (`scope`/`paths`/`session`/`usage`/`apply`), the `report.json` flag interpretation, the output template, and the rules of thumb. In short:

1. Build the latest report: `node <skill>/scripts/report.mjs --root <repo>` (writes `report.json` + `dashboard.html` under the metrics dir).
2. Read its flags (dead / always-candidate-never-applied / low-rate / un-waived MUST / unknown IDs) and combine with session evidence.
3. Classify each rule Keep / Revise / Remove / Consolidate / Add, in the narrowest correct file; if applying fixes, keep to low-risk ones.
4. Re-validate and regenerate the catalog after edits.

## report — counters and dashboard

See "Counters" below.

## Counters

Trace blocks already emit candidate + applied IDs in every relevant response, so the data exists in transcripts — it just needs collecting. Two collectors share one append-only event log (`<metricsDir>/traces.jsonl`), deduped by transcript message UUID so they never double-count:

- **Offline backfill (tool-agnostic):** `node <skill>/scripts/parse-traces.mjs --root <repo>` walks saved Claude Code transcripts (default `~/.claude/projects/<encoded-cwd>/`) and appends any trace blocks it finds. Re-runnable; retroactive over history. Point `--transcripts <dir>` at another tool's transcript store if its records expose `uuid` + an assistant `message.content`.
- **Live Stop-hook (Claude Code only):** wire `scripts/record-trace.mjs` as a `Stop` hook (see `references/importer-wiring.md`). It records each finished main-agent response automatically. Ignores `SubagentStop`; never blocks the agent.

Then `node <skill>/scripts/report.mjs --root <repo>` aggregates the log into per-rule candidate/applied/rate plus the flag lists, writing `report.json` and a self-contained `dashboard.html`. To publish the dashboard as a shareable Artifact, render the generated HTML with the Artifact tool.

**Honest limits to state when you present counts:** they are self-reported (what the model *claimed*, not proof of compliance); a rule never surfaced as a candidate is invisible (false absence); and counts need volume before rates mean much. The live hook is Claude-Code-specific; the convention and offline parser are tool-agnostic.

## Validate (CI)

`node <skill>/scripts/validate-rules.mjs --root <repo>` checks: every catalog ID resolves to a heading; every heading is catalogued; no duplicate IDs; the importers reference identical file sets; required fields present (incl. Severity — pass `--no-severity` while migrating before severities are added); and warns on numbering gaps. Trace-lint mode `--lint-file <path>` flags cited IDs missing from the catalog. Exit 1 on errors. For copy-paste GitHub Actions / GitLab / package-script / Stop-hook snippets, see `references/ci-wiring.md`.

# rule-traceability

See which agent rules actually shaped the work.

`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and tool configs are easy to grow and hard to debug. After a few weeks, you usually cannot tell which instructions are still useful, which ones are noise, or whether Claude, OpenCode, Codex, Cursor, and other tools are even loading the same rules.

`rule-traceability` turns agent rules into a reviewable loop:

1. Migrate prose rules into stable, citable IDs.
2. Ask agents to disclose which rules were candidates, applied, or deliberately skipped.
3. Validate that the catalog, rule files, and importers have not drifted.
4. Report usage so dead, broad, skipped, or stale rules become visible.

Rules loaded into a coding agent are *loaded* context, not *applied* context. A rule that was followed looks identical to one that was ignored unless the agent makes the difference visible. This skill closes that gap with stable rule IDs, trace blocks, a deterministic validator, and cross-session usage reports.

Background: [Making AI-agent rule application visible - stable IDs and trace blocks](https://seanleecoder.hashnode.dev/making-ai-agent-rule-application-visible-stable-ids-and-trace-blocks).

## Why Use It

Use this when your agent rules have become important enough to break things, but still invisible enough that no one can inspect them.

- Give reviewers a concrete trace instead of "the agent followed project rules" as an unverifiable claim.
- Find rules that are never candidates and should be removed, narrowed, or rewritten.
- Find rules that are always candidates but rarely applied, usually a sign they are too broad, too expensive, or miscoped.
- Catch `MUST` rules that were in scope but neither applied nor explicitly waived.
- Fail CI when a catalog ID no longer resolves to a heading, a rule is missing required fields, an importer drifts, or `.opencode/opencode.json` is malformed.
- Keep multiple agent tools loading the same canonical rule files when a repo uses more than one.

This is not compliance theater. Counts are self-reported by the model, so they are an audit signal, not proof. The value is that previously invisible rule behavior becomes reviewable.

## Core Workflow

Most teams should start with the core loop:

1. **Migrate** existing prose from `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, package READMEs, and docs into ID-based rules.
2. **Validate** the rule system so every catalog entry resolves, every rule has required fields, and configured importers load the same file set.
3. **Collect** trace blocks from saved transcripts or a live Claude Code hook.
4. **Report** candidate/applied/deviation counts into `.agents/metrics/report.json` and an optional `dashboard.html`.

The skill also supports `init` for new repos and `audit` for cleanup after you have enough usage data, but `migrate -> validate -> collect -> report` is the main release path. Do not skip collect: `report` only aggregates traces that already exist, so a report run before any traces are collected flags every catalogued rule as dead.

## Before And After

Before, rules are usually prose in one or more importer files:

```md
# CLAUDE.md

Always use pnpm, not npm.
Run relevant tests before finishing.
Keep agent importers in sync.
```

After migration, each enforceable rule gets a stable ID and a trigger:

```md
## ROOT-001

- Scope: repository
- Applies when: installing dependencies or running package scripts
- Severity: MUST
- Rule: Use pnpm, not npm.

## TEST-001

- Scope: tests
- Applies when: changing runtime behavior
- Severity: SHOULD
- Rule: Run the relevant tests before finishing.
```

An agent response can then disclose what mattered:

```md
Rule trace

- Candidate rules loaded: [`ROOT-001`](rules/root.md), [`TEST-001`](rules/testing.md)
- Rules applied: [`ROOT-001`](rules/root.md)
- Sources: [`.agents/rules/root.md`](rules/root.md), [`.agents/rules/testing.md`](rules/testing.md)
- Reasoning note: dependency commands were involved, but the change was docs-only.
- Deviations: [`TEST-001`](rules/testing.md) - docs-only change; no runtime behavior changed.
```

Across sessions, the report turns those traces into maintenance signal:

```text
TEST-001: candidate 42x, applied 8x, waived 20x
```

That does not prove the agent was right. It tells you `TEST-001` is worth reviewing: maybe the trigger is too broad, maybe the rule is too expensive, or maybe the team is repeatedly waiving something it claims to care about.

## What You Get

Core pieces:

- **Stable rule IDs** anchored at markdown `##` headings.
- **A catalog** (`.agents/rules-catalog.md`) that indexes every rule ID and source file.
- **Trace blocks** that distinguish candidate rules, applied rules, and deliberate deviations.
- **A validator** that is deterministic, dependency-free, CI-friendly, and runnable without an agent runtime.
- **Usage reports** that aggregate traces across sessions into candidate/applied/rate metrics.

Optional adoption support:

- **Thin importers** so each agent tool can load the same canonical files instead of divergent prose.
- **A dashboard** that flags dead rules, always-candidate-never-applied rules, low application rate, un-waived `MUST` gaps, and unknown IDs.
- **CI snippets** for GitHub Actions and GitLab.
- **A Claude Code Stop hook** for live usage collection.
- **Scaffolding** for optional CI, hook, and metrics wiring.
- **Audit mode** for cleaning up rule sets after reports have useful volume.

## Install

Use [skills.sh](https://skills.sh) for the normal install path:

```bash
npx skills add seanleecoder/rule-traceability
```

This installs into every detected agent at once, such as Claude Code under `.claude/skills/` and OpenCode/Codex/Cursor under `.agents/skills/`. Add `-g` for a global install, or `--copy` to copy instead of symlink. Update later with `npx skills update rule-traceability`.

For CI-only validation, use the package CLI without an agent runtime:

```bash
npx github:seanleecoder/rule-traceability validate
```

For Claude Code live counting, install the plugin:

```text
/plugin marketplace add seanleecoder/rule-traceability
/plugin install rule-traceability@seanleecoder-skills
```

The plugin ships a `Stop` hook in [`hooks/hooks.json`](hooks/hooks.json), so finished Claude Code responses can be recorded live.

## Quickstart

Once installed, ask your agent to migrate an existing repo:

```text
use rule-traceability to migrate this repo's rules
```

Useful starting points:

- **Existing rules:** ask for `migrate`. The agent gathers `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.opencode/opencode.json`, package READMEs, and any docs you point it at, then splits prose into ID-based rules.
- **No existing system:** ask for `init`. The agent creates `.agents/traceability.md`, `.agents/rules-catalog.md`, an example `.agents/rules/root.md`, and optional thin importers.
- **Just validate:** run `rule-traceability validate` or `node <skill>/scripts/validate-rules.mjs` from the target repo root.
- **Just count usage:** run `parse` to backfill traces from transcripts, then `report` to build the report and dashboard.
- **Ready to clean up:** after you have enough trace data, ask for `audit` to classify rules as keep, revise, remove, consolidate, or add.

## Commands

The deterministic scripts are available directly:

```bash
# Validate the rule system.
node <skill>/scripts/validate-rules.mjs --root <repo>

# Backfill trace events from saved transcripts.
node <skill>/scripts/parse-traces.mjs --root <repo> --transcripts <dir>

# Build .agents/metrics/report.json and dashboard.html.
node <skill>/scripts/report.mjs --root <repo> --low-rate 0.5 --min-candidates 3

# Generate the catalog from rule headings, preserving curated summaries.
node <skill>/scripts/generate-catalog.mjs --root <repo> --write
```

The CLI exposes the same core tools:

```bash
npx github:seanleecoder/rule-traceability <validate|parse|report|catalog|scaffold>
```

## Counters And Dashboard

Trace blocks already carry candidate and applied IDs, so the data exists in transcripts. The collectors append events into one UUID-deduped log at `.agents/metrics/traces.jsonl`.

- **Offline backfill:** `parse-traces.mjs` scans saved transcripts and appends trace blocks. It is re-runnable and tool-agnostic when the transcript records expose a UUID and assistant text.
- **Live Claude Code hook:** `record-trace.mjs` records each finished main-agent response from a Claude Code `Stop` hook. The plugin wires this automatically; skills.sh and standalone installs can add the hook manually from `references/importer-wiring.md`.

`report.mjs` writes `.agents/metrics/report.json` and `.agents/metrics/dashboard.html`. Tune noisy repos with `--low-rate <0..1>` and `--min-candidates <n>`.

The dashboard highlights:

- `deadRules` - catalogued rules that were never candidates.
- `alwaysCandidateNeverApplied` - rules that came up but never constrained the work.
- `lowRate` - rules below the configured application-rate threshold.
- `unwaivedMustGaps` - `MUST` rules that were candidates but neither applied nor waived.
- `unknownIds` - hallucinated or stale IDs cited by traces.

## Validation And CI

`validate-rules.mjs` fails on rule-system errors and exits `1`:

- Catalog IDs that no longer resolve to `## ID` headings.
- Rule headings missing from the catalog.
- Duplicate rule IDs.
- Missing required fields: `Scope`, `Applies when`, `Severity`, and `Rule`.
- Invalid severity values outside `MUST`, `SHOULD`, and `MAY`.
- Importer drift, where configured agent tools load different rule file sets.
- Malformed OpenCode config when `.opencode/opencode.json` is present.
- Trace blocks that cite IDs missing from the catalog when using `--lint-file <path>`.

It warns, but does not fail, when configured importers are absent or numbered IDs have gaps. If a repo intentionally uses only one agent tool, set `importers` in `.agents/traceability.config.json` to just that entry so validation stays quiet.

Example package script:

```json
{
  "scripts": {
    "rules:validate": "node .agents/skills/rule-traceability/scripts/validate-rules.mjs"
  }
}
```

More CI snippets live in `skills/rule-traceability/references/ci-wiring.md`.

## Optional Scaffolding

`scaffold-wiring.mjs` writes optional operational glue. It is non-destructive: existing files are left untouched, and merge instructions are printed when manual integration is needed.

```bash
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --all
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --hook
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --gitignore
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --ci github
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --ci gitlab
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --ci none
```

With no selector flags, `--all` is assumed. Selective flags do only what they say: `--hook` does not create CI, and `--gitignore` does not create a hook.

## Tests And Evals

The repo includes deterministic tests for the scripts, manifests, docs, and regression cases:

```bash
npm test
```

Behavioral evals exercise the agent-driven `migrate` mode on fixture repos:

```bash
node evals/run.mjs
node evals/run.mjs --exec --fixtures single-claude-md,oss
node evals/run.mjs --grade-only
```

See [`evals/README.md`](evals/README.md) for the eval workflow and `fetch-oss.mjs` for adding a real public-repo fixture.

## Limits

Rule traces are self-reported. They tell you what the model claimed was in scope and applied; they do not prove the model complied. Treat the report as a review surface.

A rule that never appears as a candidate is invisible to the counters, so early reports with low volume are directional. The first useful result is often not a perfect score; it is a short list of rules worth deleting, narrowing, or rewriting.

## License

MIT (c) Sean Lee ([seanleecoder](https://github.com/seanleecoder))

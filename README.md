# rule-traceability

See which agent rules actually shaped the work.

`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and tool configs are easy to grow and hard to debug. After a few weeks, you usually cannot tell which instructions are still useful, which ones are noise, or whether Claude, OpenCode, Codex, and Cursor are even loading the same rules.

`rule-traceability` turns agent rules into something you can cite, validate, count, and clean up.

Rules loaded into a coding agent are *loaded* context, not *applied* context. A rule that was followed looks identical to one that was ignored. This skill closes that gap with stable rule IDs, response-time trace blocks, usage counters, and a deterministic validator.

It is a portable, tool-agnostic [Agent Skill](https://skills.sh) with four modes:

- **init** - scaffold a fresh traceable rule system.
- **migrate** - convert existing scattered rules into an ID-based format.
- **audit** - maintain the rule set using repo state and usage data.
- **report** - aggregate traces into `report.json` and `dashboard.html`.

Background: [Making AI-agent rule application visible - stable IDs and trace blocks](https://seanleecoder.hashnode.dev/making-ai-agent-rule-application-visible-stable-ids-and-trace-blocks).

## Why Use It

Use this when your agent rules have become important enough to break things, but still invisible enough that no one can inspect them.

- Find rules that are never candidates and should be removed or rewritten.
- Find rules that are always candidates but rarely applied, usually a sign they are too broad, too expensive, or miscoped.
- Catch `MUST` rules that were in scope but neither applied nor explicitly waived.
- Keep Claude Code, OpenCode, Codex, Cursor, and other importers loading the same rule files.
- Fail CI when a catalog ID no longer resolves to a heading, a rule is missing required fields, an importer drifts, or `.opencode/opencode.json` is malformed.
- Give reviewers a concrete trace instead of "the agent followed project rules" as an unverifiable claim.

This is not compliance theater. Counts are self-reported by the model, so they are an audit signal, not proof. The value is that previously invisible rule behavior becomes reviewable.

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

- **Stable rule IDs** anchored at markdown `##` headings.
- **A catalog** (`.agents/rules-catalog.md`) that indexes every rule ID and source file.
- **Thin importers** so every agent tool loads the same canonical files instead of divergent prose.
- **Trace blocks** that distinguish candidate rules, applied rules, and deliberate deviations.
- **Usage counters** that aggregate traces across sessions into candidate/applied/rate metrics.
- **A dashboard** that flags dead rules, always-candidate-never-applied rules, low application rate, un-waived `MUST` gaps, and unknown IDs.
- **A validator** that is deterministic, dependency-free, CI-friendly, and runnable without an agent runtime.

## Install

### Across All Agents

Use [skills.sh](https://skills.sh) when you want the same skill available to multiple agent tools:

```bash
npx skills add seanleecoder/rule-traceability
```

This installs into every detected agent at once, such as Claude Code under `.claude/skills/` and OpenCode/Codex/Cursor under `.agents/skills/`. Add `-g` for a global install, or `--copy` to copy instead of symlink. Update later with `npx skills update rule-traceability`.

### As A Claude Code Plugin

Use the plugin when you want Claude Code to wire the live usage counter automatically:

```text
/plugin marketplace add seanleecoder/rule-traceability
/plugin install rule-traceability@seanleecoder-skills
```

The plugin ships a `Stop` hook in [`hooks/hooks.json`](hooks/hooks.json), so finished Claude Code responses can be recorded live.

### As A CLI In CI

Use the CLI when no agent runtime is available, such as a GitHub Actions or GitLab CI job:

```bash
npx github:seanleecoder/rule-traceability validate
```

The package exposes `rule-traceability` as a Node CLI and the scripts themselves remain plain Node >=18 with zero dependencies.

## Quickstart

Once installed, ask your agent to use the skill:

```text
use rule-traceability to migrate this repo's rules
```

Useful starting points:

- **Existing rules:** ask for `migrate`. The agent gathers `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.opencode/opencode.json`, package READMEs, and any docs you point it at, then splits prose into ID-based rules.
- **No existing system:** ask for `init`. The agent creates `.agents/traceability.md`, `.agents/rules-catalog.md`, an example `.agents/rules/root.md`, and thin importers.
- **Just validate:** run `rule-traceability validate` or `node <skill>/scripts/validate-rules.mjs` from the target repo root.
- **Just count usage:** run `parse` to backfill traces from transcripts, then `report` to build the dashboard.

The deterministic commands are available directly:

```bash
# Validate the rule system.
node <skill>/scripts/validate-rules.mjs --root <repo>

# Backfill trace events from saved transcripts.
node <skill>/scripts/parse-traces.mjs --root <repo> --transcripts <dir>

# Build .agents/metrics/report.json and dashboard.html.
node <skill>/scripts/report.mjs --root <repo> --low-rate 0.5 --min-candidates 3

# Generate the catalog from rule headings, preserving curated summaries.
node <skill>/scripts/generate-catalog.mjs --root <repo> --write

# Scaffold optional wiring without overwriting existing files.
node <skill>/scripts/scaffold-wiring.mjs --root <repo> --all
```

The CLI exposes the same tools:

```bash
npx github:seanleecoder/rule-traceability <validate|parse|report|catalog|scaffold>
```

## Scaffolding

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
- Importer drift, where agent tools load different rule file sets.
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

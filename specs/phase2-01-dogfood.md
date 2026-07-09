# Spec 2.1 — Dogfood: run rule-trace on this repository

**Review finding:** DESIGN_REVIEW.md P3 (High). **Effort:** S. **Depends on:** nothing (spec 2.2 consumes this spec's output).

## Goal

This repository adopts its own system: real rules with stable IDs under `.agents/rules/`, a generated catalog, thin importers, and the validator running in CI. The result is both credibility ("this repo uses itself") and a permanent, living example of the end state.

## Background

The repo currently has **no** `CLAUDE.md`, `AGENTS.md`, or `.agents/` directory. Its genuine standing conventions live implicitly in code comments, `tests/`, and `specs/README.md` ("Global conventions"). The skill's own `migrate` mode (`skills/rule-trace/SKILL.md`, `references/migration-guide.md`) defines the procedure; follow it as a real user would.

## Requirements

### R1 — Extract the real rules

Source material: `specs/README.md` global conventions, recurring code-comment constraints, and the test suite's implicit contracts. Create rules **only** for conventions the repo demonstrably has (the migration guide's own instruction: don't invent). Expected set, roughly:

- `ROOT-*` (repo-wide): dependency-free scripts (Node ≥ 18, `node:` builtins only); version lockstep across the four locations; code style (no semicolons, single quotes, constraint-comments).
- `TEST-*`: behavior changes need a hermetic node:test in `tests/` (mkdtemp fixtures, `CLAUDE_CONFIG_DIR` isolation); deterministic tests only in CI — agent-driven evals stay out of `npm test`.
- `DOCS-*`: script/flag/layout changes update README + SKILL.md + references in the same change; docs must not reference nonexistent scripts.

Write them in the standard anatomy (`references/rule-anatomy.md`): `## ID` heading + `- Scope:` / `- Applies when:` / `- Severity:` / `- Rule:`. Severity honestly (not everything MUST — reserve MUST for the no-dependency and lockstep rules).

### R2 — Standard layout

- Rules in `.agents/rules/root.md`, `.agents/rules/testing.md`, `.agents/rules/docs.md` (per the file-per-prefix convention).
- Convention file: copy `skills/rule-trace/templates/rule-trace.md.tmpl` → `.agents/rule-trace.md`.
- Catalog: generate with `node skills/rule-trace/scripts/generate-catalog.mjs --root . --write`; hand-tune summaries only if the derived ones are poor.
- Config: `.agents/rule-trace.config.json` with `packageRuleGlobs: []` (no packages here) and `importers` set to exactly the entry points this repo ships (see R3) so the validator doesn't warn about absent ones — this is the documented single-tool pattern (`README.md:212`).

### R3 — Importers

Create `CLAUDE.md` and `AGENTS.md` at the repo root as thin `@`-import files (identical line sets):

```
@.agents/rules/root.md
@.agents/rules/testing.md
@.agents/rules/docs.md
@.agents/rule-trace.md
```

No `.opencode/opencode.json` (the repo doesn't use OpenCode) — hence the config's `importers` lists only the two `at-import` entries.

### R4 — CI + gitignore

- Add a validate step to the existing `.github/workflows/ci.yml` test job (after the test step): `run: node skills/rule-trace/scripts/validate-rules.mjs` — use the local script, not npx (this repo *is* the source).
- The repo `.gitignore` already ignores `.agents/metrics/*` outputs at the root — verify the committed files (rules, catalog, config, rule-trace.md, importers) are not ignored.

### R5 — README mention

One short paragraph + link in the README (near "Why Use It" or "Install"): this repo dogfoods the skill — see `.agents/` and `CLAUDE.md` for a live example of the migrated end state.

## Acceptance criteria

1. `node skills/rule-trace/scripts/validate-rules.mjs --root .` exits 0 with zero errors **and zero warnings**.
2. `node skills/rule-trace/scripts/generate-catalog.mjs --root .` (dry run) produces the same table as the committed catalog (i.e. the catalog is regeneration-stable).
3. Every rule maps to a demonstrable repo convention — cite the evidence (file/test/comment) for each rule in your summary.
4. At least 6 and at most ~12 rules (this is a small repo; a bloated rule set would be its own anti-example).
5. CI workflow runs the validator; `npm test` still green.
6. README links to the live example.

## Tests to add

None mandatory — the CI validator step *is* the guard (and note: `tests/rule-trace.test.mjs:6-7` explicitly says repo-content validation belongs to the consuming project, which this repo now also is; the CI step is the right home, not a unit test).

## Out of scope

- Wiring the Stop hook / metrics collection for this repo (developers can opt in individually; committed settings would fight with contributor setups).
- Seeded example metrics (spec 2.2 handles the example/demo data).
- Any rule content for hypothetical conventions the repo doesn't actually follow.

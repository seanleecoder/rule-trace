# Migration guide — existing rules → traceable form

This is the `migrate` mode in detail. The goal is to turn whatever rules a repo already has (however scattered or prose-y) into discrete, ID'd, catalogued rules without inventing or losing anything. Extraction needs judgment; the validator is the deterministic check at the end.

## 1. Gather every source

Collect the existing rule material before rewriting:
- entry points: `CLAUDE.md`, `AGENTS.md`, `.opencode/opencode.json` instructions, `.cursorrules`, `.github/copilot-instructions.md`
- any READMEs, `CONTRIBUTING.md`, or docs the user names as containing standing rules
- per-package conventions if it's a monorepo

Read them all first. Note overlaps — the same rule stated in three files becomes one ID.

## 2. Split prose into discrete rules

One rule = one enforceable idea with one trigger. Watch for these splits:
- A paragraph that says "do X, and also Y when Z" is usually two rules with different "Applies when".
- A bullet that mixes a fact ("we use Yarn 4") with an instruction ("run `yarn install --immutable` in CI") may be one rule with two `- Rule:` bullets, or two rules — split if the triggers differ.

Drop pure narration that constrains nothing (it has no place in a candidate set). If you're unsure whether something is a rule, ask: *could a future response cite this to justify a decision?* If not, it's documentation, not a rule.

## 3. Assign layered IDs

Classify each rule by reach and assign a prefix (see `rule-anatomy.md`): `ROOT-` for repo-wide, a topic prefix for an area, `GLOBAL-<TAG>-` for cross-cutting policy, `PKG-<PKG>-<AREA>-` for package-local. Number sequentially per prefix starting at `001`. Choose topic prefixes that read well in a trace (`TEST`, `STYLE`, `SEC`, `CI`).

Group rules into files by prefix: all `ROOT-*` in `root.md`, each topic in its own file, package rules under that package's `.agents/rules/`.

## 4. Rewrite into the anatomy

For each rule write Scope / Applies when / Severity / Rule per `rule-anatomy.md`. The two fields that take the most care:
- **Applies when** — phrase the real trigger situation, not the topic. This determines candidacy; get it right and the candidate sets stay honest.
- **Severity** — assign `MUST`/`SHOULD`/`MAY` from how the source talks about it. Don't default everything to MUST; reserve it for genuine hard constraints.

Preserve concrete references (file paths, command names) from the source — they're what make a rule checkable.

## 5. Build the catalog and wire importers

Create `.agents/rules-catalog.md` with one row per rule (`catalog-format.md`). Replace the scattered prose in the entry points with `@`-imports / `instructions` entries pointing at the new rule files (`importer-wiring.md`), keeping all importers in lockstep. Add `.agents/rule-trace.md` from the template so agents know to emit traces.

## 6. Validate

```
node <skill>/scripts/validate-rules.mjs --root <repo>
```

While mid-migration (before severities are added), `--no-severity` lets the rest pass. Resolve every error before declaring the migration done; warnings (numbering gaps) are advisory.

## What good output looks like

- Every former prose rule maps to exactly one ID (or is consciously dropped as non-rule).
- No rule lost, none invented.
- The catalog and headings agree (validator passes).
- The entry points are thin importers, not rule definitions.
- A reviewer can read any trace block and click straight through to the cited rule.

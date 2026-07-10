# Contributing

## Setup & test

Clone the repo, use Node >= 18, and run `npm test`. There is no install step: rule-trace runtime scripts are intentionally dependency-free and use only Node built-ins.

## Invariants

This repo dogfoods its conventions in `.agents/rules/`; those rule files are the canonical policy. In short:

- Dependency-free scripts: enforced by review and syntax/tests around `skills/rule-trace/scripts/`.
- Version lockstep across `package.json`, `.claude-plugin/plugin.json`, `skills/rule-trace/metadata.json`, and `skills/rule-trace/SKILL.md` frontmatter: enforced by `tests/doc-integrity.test.mjs`.
- Docs move with code: update `README.md`, `skills/rule-trace/SKILL.md`, and relevant references when flags, outputs, layouts, importers, hooks, metrics, or release behavior change.
- Every behavior change gets a hermetic `node:test` test under `tests/`, using temp fixtures and isolated Claude config where needed.
- The Stop hook must never throw or block the agent.

## Tests vs evals

`tests/` is deterministic and runs in CI. `evals/` drives real agents, may cost money, and never runs in CI; see `evals/README.md`.

## Style

Match surrounding code: ES modules, single quotes, no semicolons, 2-space indent, and comments that explain constraints rather than narrating obvious code.

## Releases

Follow `RELEASING.md` for version bumps, docs generation checks, and publication steps.

## Where to start

Check the [issue tracker](https://github.com/seanleecoder/rule-trace/issues). Docs, examples, fixtures, and clearer diagnostics are especially welcome first contributions.

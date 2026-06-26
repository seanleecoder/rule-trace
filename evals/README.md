# Evals

Behavioral evals for the **agent-driven** modes of the skill (`migrate` first). The skill's unit tests (`/tests`) cover the deterministic scripts; these cover whether an agent, handed the skill + a messy repo, produces a correct traceable rule set. The skill ships its own validator, so grading is largely objective.

## Pieces

- `fixtures/` — synthetic untraced-rule repos of varied shape: `single-claude-md/`, `cursorrules/`, `mini-monorepo/`. Plus `fixtures/oss/` (git-ignored) fetched on demand.
- `fetch-oss.mjs` — clone one public repo (with a CLAUDE.md / AGENTS.md / .cursorrules) as a "real project" fixture: `node evals/fetch-oss.mjs --repo owner/project`.
- `grade.mjs` — the deterministic oracle: run after a migrate, scores by the validator + catalog/convention presence + rule count. `node evals/grade.mjs --root <migrated-dir> --json`.
- `evals.json` — the eval prompts + assertions (deterministic + a few LLM-judge).

## Running a round

For each eval, run an agent over a **copy** of the fixture (migrate mutates files), once **with the skill** and once **baseline** (no skill), then grade both:

```bash
cp -R evals/fixtures/single-claude-md /tmp/rt-eval-1 && cd /tmp/rt-eval-1
# with-skill: point an agent at skills/rule-traceability/SKILL.md and ask it to migrate this repo
# baseline:   same prompt, no skill
node <repo>/evals/grade.mjs --root /tmp/rt-eval-1 --json
```

The signal is the **delta**: with-skill should score 1 (validator-clean traceable rule set); baseline should score 0 (no catalog / no ID scheme). The `skill-creator` skill automates the with/baseline spawn, grading, and a benchmark viewer.

These evals need an agent runtime (subagents / `claude -p`), so they are **not** part of the GitHub CI (which only runs the deterministic `/tests`). Run them on demand.

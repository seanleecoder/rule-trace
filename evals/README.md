# Evals

Behavioral evals for the **agent-driven** modes of the skill (`migrate` first). The skill's unit tests (`/tests`) cover the deterministic scripts; these cover whether an agent, handed the skill + a messy repo, produces a correct traceable rule set. The skill ships its own validator, so grading is largely objective.

## Pieces

- `fixtures/` — synthetic untraced-rule repos of varied shape: `single-claude-md/`, `cursorrules/`, `mini-monorepo/`. Plus `fixtures/oss/` (git-ignored) fetched on demand.
- `fetch-oss.mjs` — clone one public repo (with a CLAUDE.md / AGENTS.md / .cursorrules) as a "real project" fixture: `node evals/fetch-oss.mjs --repo owner/project`.
- `grade.mjs` — the deterministic oracle: run after a migrate, scores by the validator + catalog/convention presence + rule count. `node evals/grade.mjs --root <migrated-dir> --json`.
- `evals.json` — the eval prompts + assertions (deterministic + a few LLM-judge).

## Triggering it later — three modes

**1. Deterministic guards (no agent, runs in CI):**

```bash
npm test          # unit tests + doc/script-integrity guards
```

**2. Plan a round (no agent, no spend):** set up isolated fixture copies, print the exact migrate command per fixture, and grade whatever's there.

```bash
node evals/run.mjs
```

**3. Run a round (drives `claude -p`):** `--exec` actually performs the migrate, then grades. The signal is the **delta** — with-skill scores 1 (validator-clean traceable rule set), baseline scores 0.

```bash
node evals/fetch-oss.mjs --repo archtechx/tenancy   # once, for the oss fixture
node evals/run.mjs --exec --fixtures single-claude-md,oss   # smaller round
node evals/run.mjs --exec --baseline                        # full round, both arms
node evals/run.mjs --grade-only                             # re-grade the current workspace
```

`--exec` needs an agent CLI on PATH (`claude`) and a permissive mode (the runner uses `--permission-mode bypassPermissions` on a throwaway copy). Or skip the runner entirely and **ask Claude Code**: "run the rule-trace eval round (smaller/full)".

The LLM modes are **not** in GitHub CI (no API key there); only mode 1 runs in CI. The grader (`grade.mjs`) and the synthetic fixtures are committed; `fixtures/oss/` and `.eval-workspace/` are git-ignored.

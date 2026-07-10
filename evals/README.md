# Evals

Behavioral evals for the **agent-driven** modes of the skill (`migrate` first). The skill's unit tests (`/tests`) cover the deterministic scripts; these cover whether an agent, handed the skill + a messy repo, produces a correct traceable rule set. The skill ships its own validator, so grading is largely objective.

## Pieces

- `fixtures/` — synthetic untraced-rule repos of varied shape: `single-claude-md/`, `cursorrules/`, `mini-monorepo/`. Plus `fixtures/oss/` (git-ignored) fetched on demand.
- `fetch-oss.mjs` — clone one public repo (with a CLAUDE.md / AGENTS.md / .cursorrules) as a "real project" fixture: `node evals/fetch-oss.mjs --repo owner/project`.
- `grade.mjs` — the deterministic oracle: run after a migrate, scores by the validator + catalog presence + `.agents/rule-trace.md` containing the expected `Rule trace` template + rule count. `node evals/grade.mjs --root <migrated-dir> --json`.
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

**3. Run a round (drives an agent CLI):** `--exec` actually performs the migrate, then grades. The signal is the **delta** — with-skill scores 1 (validator-clean traceable rule set), baseline scores 0. Claude is the default agent for compatibility; pass `--agent codex` to run the same prompts through Codex. A validator-clean rule set means rule files use the README anatomy: `## ID` headings plus `- Scope:`, `- Applies when:`, `- Severity:`, and `- Rule:` fields.

```bash
node evals/fetch-oss.mjs --repo archtechx/tenancy   # once, for the oss fixture
node evals/run.mjs --exec --fixtures single-claude-md,oss   # smaller round
node evals/run.mjs --exec --agent codex --fixtures single-claude-md,oss
node evals/run.mjs --exec --agent codex --codex-sandbox danger-full-access --fixtures single-claude-md
node evals/run.mjs --exec --baseline                        # full round, both arms
node evals/run.mjs --grade-only                             # re-grade the current workspace
```

`--exec` needs an agent CLI on PATH (`claude` or `codex`). The runner uses permissive/non-interactive settings on a throwaway copy: `claude -p --permission-mode bypassPermissions` for Claude, or `codex --sandbox workspace-write --ask-for-approval never exec` for Codex. If Codex's `workspace-write` sandbox blocks the required `.agents/` output path, rerun the throwaway fixture with `--codex-sandbox danger-full-access`. Or skip the runner entirely and ask your current coding agent to run the rule-trace eval round.

After each run, the summary prints an **outputs** section showing:
- `before`: the source fixture under `evals/fixtures/<name>/`
- `after (with-skill)`: the migrated copy for the skill arm
- `after (baseline)`: the migrated copy for the no-skill arm, when `--baseline` is enabled

Use those paths directly to inspect or diff the eval outputs. If a Codex run produces no `.agents/` directory, or produces `.agents/` files that the validator cannot recognize as rule-trace rules, the runner prints a **diagnostics** section with the likely fix.

The migrate eval checks that the repo now contains `.agents/rule-trace.md` with the expected trace-block template. It does not currently grade whether the agent's final chat response appended a `Rule trace` block; that belongs to trace-lint/transcript evals, not the migration-output score.

The LLM modes are **not** in GitHub CI (no API key there); only mode 1 runs in CI. The grader (`grade.mjs`) and the synthetic fixtures are committed; `fixtures/oss/` and `.eval-workspace/` are git-ignored.


## Compliance benchmark

`evals/compliance/run.mjs` measures whether agents comply with the same rules more often when delivered as plain prose, rule-trace with the trace convention, or ID-only rule files without the convention. Fixtures live under `evals/compliance/fixtures/`; each committed `checks.mjs` is a deterministic, dependency-free oracle decided before agent runs.

Plan mode is the default and never invokes an agent:

```bash
node evals/compliance/run.mjs
```

To run a real round, use an authenticated agent CLI and opt in explicitly:

```bash
node evals/compliance/run.mjs --exec --trials 2 --agent claude --report evals/compliance/PILOT.md
```

Read the rates as directional until trial counts are large. The runner reports compliance by arm, per-rule outcomes in JSON under `evals/compliance/results/`, trace-emission behavior, and whether traced-arm violations were disclosed as deviations or stayed silent. Do not tune checks after seeing outputs; publish null or negative results honestly. Agent-driven evals may cost money and do not run in CI.

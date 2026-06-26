# Wiring importers and the Stop hook

## Importers (the lockstep rule)

Each agent tool has its own entry point, but they must all load the **identical set** of rule files. Drift between them is the single most common way the system rots, so the validator treats any difference as an error.

**`CLAUDE.md` and `AGENTS.md`** (Claude Code / AGENTS.md-compatible tools) use `@`-imports — one per line, nothing else on the line:

```md
@.agents/architecture.md
@.agents/rules/root.md
@.agents/rules/testing.md
@.agents/traceability.md
```

**`.opencode/opencode.json`** (OpenCode) uses a flat `instructions` array with the same paths:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    ".agents/architecture.md",
    ".agents/rules/root.md",
    ".agents/rules/testing.md",
    ".agents/traceability.md"
  ]
}
```

Two consequences worth stating to the user:
- **Keep the importer entry points thin.** They import; they don't define rules. Canonical content lives in `.agents/`.
- **No nested `@`-imports inside rule files.** Claude Code would expand them recursively, but OpenCode's flat list won't, so a nested import silently desyncs the tools. Keep each rule file self-contained.

Other tools (`.cursorrules`, `.github/copilot-instructions.md`) can be added to the config's `importers` list once their format is represented; until then, wire them by hand and note they're outside the parity check.

## The Stop hook (Claude Code only)

The live counter is a `Stop` hook. How it gets wired depends on how the skill was installed:

- **Installed as a Claude Code plugin** (`/plugin install`): the hook ships in the plugin's `hooks/hooks.json` (command `node "${CLAUDE_PLUGIN_ROOT}/skills/rule-traceability/scripts/record-trace.mjs"`) and is wired automatically — nothing to do.
- **Installed via skills.sh or standalone** (the skill folder lives at `.agents/skills/` with a `.claude/skills/` symlink, but no plugin): add the hook by hand to `.claude/settings.json` (project) or `~/.claude/settings.json` (user), as below.

Other agents (OpenCode, Codex) have no equivalent Stop hook; collect their counts with the offline parser instead (`parse-traces.mjs --transcripts <their transcript dir>`).

Manual entry for a skills.sh / standalone install:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.agents/skills/rule-traceability/scripts/record-trace.mjs\""
          }
        ]
      }
    ]
  }
}
```

The hook reads the Stop payload from stdin, finds the last main-agent assistant message, and appends its trace block to `<metricsDir>/traces.jsonl`. It ignores `SubagentStop`, dedupes by message UUID, and always exits 0 — it can never block or fail the agent. If the repo installs the skill via the `.claude/skills/<name>` symlink, the `command` path stays the same because it points at the real `.agents/skills/...` location.

This is the only tool-specific piece. The convention, catalog, validator, and offline parser are tool-agnostic.

# Wiring importers and the Stop hook

## Importers (support matrix and lockstep rule)

The validator can prove that configured entry points reference the same files. It cannot prove that every agent tool expands every reference syntax. Use this matrix when choosing an importer pattern:

| Tool | Entry point | Reference mechanism | Rules actually loaded? | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md`; project memory can also include imported files | `@path` imports in memory files | Yes for `@` imports; nested imports are expanded recursively | Anthropic Claude Code memory docs: https://docs.anthropic.com/en/docs/claude-code/memory#claude-md-imports |
| OpenAI Codex CLI | `AGENTS.md` | Plain markdown instructions | No evidence that `@path` includes are expanded; treat `@` lines as text | OpenAI Codex AGENTS.md guidance describes instruction files, not include expansion (docs-cited; no live probe run): https://github.com/openai/codex/blob/main/docs/agents.md |
| OpenCode | `.opencode/opencode.json` | `instructions` array of files, globs, or remote URLs | Yes for the listed `instructions`; paths are resolved by OpenCode config semantics | OpenCode rules docs: https://opencode.ai/docs/rules/ |
| Cursor | `.cursorrules`; `.cursor/rules/*.mdc` | Rule files selected by Cursor, not `@path` includes | No for `@` includes; use `.mdc` rule files directly | Cursor rules docs (docs-cited; no live probe run): https://docs.cursor.com/context/rules |
| GitHub Copilot | `.github/copilot-instructions.md` | Plain markdown custom instructions | No for `@` includes; links/references are not expanded into instructions | GitHub Copilot custom instructions docs (docs-cited; no live probe run): https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions |

Each agent tool has its own entry point, but configured importers should reference the **identical set** of canonical rule files when that tool supports references. Drift between configured importers is the single most common way the system rots, so the validator treats any difference as an error. For tools that do not expand `@` lines, the interim workaround is to inline or duplicate the generated rule content in that tool's native format; spec 3.2 tracks generated importers so this duplication can be produced mechanically.

**`CLAUDE.md`** uses `@`-imports — one per line, nothing else on the line:

```md
@.agents/architecture.md
@.agents/rules/root.md
@.agents/rules/testing.md
@.agents/rule-trace.md
```

`AGENTS.md` may use the same thin file for parity with Claude/Codex conventions, but current Codex-facing documentation treats it as plain markdown rather than an include-capable format. Do not assume `@.agents/rules/root.md` in `AGENTS.md` loads that file for every AGENTS.md consumer.

**`.opencode/opencode.json`** (OpenCode) uses a flat `instructions` array with the same paths:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    ".agents/architecture.md",
    ".agents/rules/root.md",
    ".agents/rules/testing.md",
    ".agents/rule-trace.md"
  ]
}
```

Two consequences worth stating to the user:
- **Keep importer entry points thin when the tool supports references.** They import; they don't define rules. Canonical content lives in `.agents/`.
- **No nested `@`-imports inside rule files.** Claude Code would expand them recursively, but OpenCode's flat list and plain-markdown tools won't, so a nested import silently desyncs tools. Keep each rule file self-contained.

Cursor and GitHub Copilot need native rule/instruction content until generated importers exist. Wire them by hand and note they're outside the parity check unless the config has a represented importer type for them.

## The Stop hook (Claude Code only)

The live counter is a `Stop` hook. How it gets wired depends on how the skill was installed:

- **Installed as a Claude Code plugin** (`/plugin install`): the hook ships in the plugin's `hooks/hooks.json` (command `node "${CLAUDE_PLUGIN_ROOT}/skills/rule-trace/scripts/record-trace.mjs"`) and is wired automatically — nothing to do.
- **Installed via skills.sh or standalone** (the skill folder lives at `.agents/skills/` with a `.claude/skills/` symlink, but no plugin): add the hook by hand to `.claude/settings.json` (project) or `~/.claude/settings.json` (user), as below.

Other agents (OpenCode, Codex) have no equivalent Stop hook; collect their counts with the offline parser instead (`parse-traces.mjs --transcripts <their transcript dir>`).

> **Pick one — never both.** These are alternatives. If the plugin is enabled and you also add the manual hook below, the recorder fires twice per response: the plugin command resolves to `${CLAUDE_PLUGIN_ROOT}/skills/rule-trace/scripts/record-trace.mjs` and the manual one to `$CLAUDE_PROJECT_DIR/.agents/skills/rule-trace/scripts/record-trace.mjs`, so Claude Code's identical-command dedup never triggers. No error surfaces — `record-trace.mjs` dedupes events by message UUID, so the second run just appends nothing — but you spawn a redundant Node process every turn. Add the manual hook only on a standalone install with no plugin; `validate-rules.mjs` and `scaffold-wiring.mjs` warn if they detect both.

Manual entry for a skills.sh / standalone install:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.agents/skills/rule-trace/scripts/record-trace.mjs\""
          }
        ]
      }
    ]
  }
}
```

The hook reads the Stop payload from stdin, finds the last main-agent assistant message, and appends its trace block to `<metricsDir>/traces.jsonl`. It ignores `SubagentStop`, dedupes by message UUID, and always exits 0 — it can never block or fail the agent. If the repo installs the skill via the `.claude/skills/<name>` symlink, the `command` path stays the same because it points at the real `.agents/skills/...` location.

This is the only tool-specific piece. The convention, catalog, validator, and offline parser are tool-agnostic.

# Documentation Rules

## DOCS-001

- Scope: user-facing documentation
- Applies when: changing scripts, CLI flags, generated layouts, importer wiring, hooks, metrics, or release workflow behavior
- Severity: SHOULD
- Rule: Update `README.md`, `skills/rule-trace/SKILL.md`, and relevant files under `skills/rule-trace/references/` in the same change so documented workflows stay aligned.

## DOCS-002

- Scope: documentation integrity
- Applies when: adding or editing command examples, links to scripts, fixture paths, or generated artifact references
- Severity: MUST
- Rule: Do not document nonexistent scripts, paths, commands, or generated outputs; keep documentation references backed by files in the repository or explicit external citations.

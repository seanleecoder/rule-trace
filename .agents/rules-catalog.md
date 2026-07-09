# Rule Trace Catalog

Discovery index for every rule ID. Generated from the rule headings by `generate-catalog.mjs` and guarded by `validate-rules.mjs`.

## Catalog

| Rule ID    | Layer | Scope                         | Severity | Source                                         | Summary                                                                                              |
| ---------- | ----- | ----------------------------- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DOCS-001` | docs  | user-facing documentation     | SHOULD   | [`.agents/rules/docs.md`](rules/docs.md)       | Update README.md, skills/rule-trace/SKILL.md, and relevant files under skills/rule-trace/references… |
| `DOCS-002` | docs  | documentation integrity       | MUST     | [`.agents/rules/docs.md`](rules/docs.md)       | Do not document nonexistent scripts, paths, commands, or generated outputs; keep documentation refe… |
| `ROOT-001` | root  | repository scripts            | MUST     | [`.agents/rules/root.md`](rules/root.md)       | Keep runtime scripts dependency-free on Node >= 18 and use node: built-ins instead of package depen… |
| `ROOT-002` | root  | releases and package metadata | MUST     | [`.agents/rules/root.md`](rules/root.md)       | Keep the package and skill version references in lockstep across package.json, .claude-plugin/plugi… |
| `ROOT-003` | root  | source style                  | SHOULD   | [`.agents/rules/root.md`](rules/root.md)       | Follow the existing style: ES modules, single quotes, no semicolons, and explanatory constraint com… |
| `TEST-001` | test  | tests                         | MUST     | [`.agents/rules/testing.md`](rules/testing.md) | Add or update hermetic node:test coverage under tests/ for behavior changes, using temporary fixtur… |
| `TEST-002` | test  | test isolation                | MUST     | [`.agents/rules/testing.md`](rules/testing.md) | Isolate test state with mkdtemp, explicit fixture roots, and CLAUDE_CONFIG_DIR or related environme… |
| `TEST-003` | test  | CI test suite                 | SHOULD   | [`.agents/rules/testing.md`](rules/testing.md) | Keep npm test deterministic and dependency-free; agent-driven evals belong under evals/ and stay ou… |

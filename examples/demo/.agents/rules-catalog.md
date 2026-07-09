# Rule Trace Catalog

Discovery index for every rule ID. Generated from the rule headings by `generate-catalog.mjs` and guarded by `validate-rules.mjs`.

## Catalog

| Rule ID         | Layer | Scope                 | Severity | Source                                         | Summary                                                                                             |
| --------------- | ----- | --------------------- | -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DEMO-ROOT-001` | demo  | dependency management | MUST     | [`.agents/rules/root.md`](rules/root.md)       | Use pnpm for package operations and do not commit npm or yarn lockfiles.                            |
| `DEMO-ROOT-002` | demo  | configuration         | MUST     | [`.agents/rules/root.md`](rules/root.md)       | Document every required environment variable in .env.example in the same change that introduces it. |
| `DEMO-ROOT-003` | demo  | application code      | SHOULD   | [`.agents/rules/root.md`](rules/root.md)       | Keep route handlers thin by moving reusable behavior into src/lib/ modules.                         |
| `DEMO-ROOT-004` | demo  | accessibility         | SHOULD   | [`.agents/rules/root.md`](rules/root.md)       | Preserve accessible names and keyboard navigation for interactive UI elements.                      |
| `DEMO-TEST-001` | demo  | tests                 | MUST     | [`.agents/rules/testing.md`](rules/testing.md) | Add or update a focused test for changed runtime behavior.                                          |
| `DEMO-TEST-002` | demo  | test determinism      | SHOULD   | [`.agents/rules/testing.md`](rules/testing.md) | Stub time, randomness, network, and filesystem state so tests are deterministic in CI.              |
| `DEMO-TEST-003` | demo  | snapshots             | MAY      | [`.agents/rules/testing.md`](rules/testing.md) | Prefer small semantic assertions over broad snapshots unless the snapshot is the product output.    |

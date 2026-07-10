# The catalog and the layout config

## The catalog

`.agents/rules-catalog.md` is the single discovery index for every rule ID. It is a markdown table; the validator parses the first cell of each row as the ID and checks it against the real headings.

```md
| Rule ID     | Layer   | Scope | Severity | Source                                   | Summary                                   |
| ----------- | ------- | ----- | -------- | ---------------------------------------- | ----------------------------------------- |
| `ROOT-001`  | root    | repo  | MUST     | [`.agents/rules/root.md`](rules/root.md) | Node/Yarn pinned; private packages need a token |
```

- The **ID cell** must be just the ID (backticks optional). The parser skips header/separator rows automatically.
- The **Source cell** should be a clickable link to the defining file.
- The **Severity cell** is optional in the table (the heading is the source of truth), but including it makes the catalog scannable.

**The invariant:** the catalog mirrors the full set of headings. Any change that adds, removes, or moves a rule must update the catalog in the *same* change. The validator fails on orphan headings (heading without a catalog row) and on dangling catalog rows (row without a heading), which is exactly what catches a heading that was moved or renamed.

## Generating the catalog

You don't have to maintain the table by hand. `scripts/generate-catalog.mjs` derives it from the `## ID` headings:

```
node <skill>/scripts/generate-catalog.mjs --root <repo>           # dry run → stdout
node <skill>/scripts/generate-catalog.mjs --root <repo> --write   # persist
```

It fills ID, Layer (from the ID prefix family), Scope and Severity (from each rule's fields), Source (a link to the defining file), and a Summary derived from the rule's first `- Rule:` sentence. **Existing summaries are preserved** — re-running only fills rows for new IDs, so curated wording is never overwritten. When the catalog already exists, only the table region is rewritten; surrounding prose is kept. The validator still guards the result, so generate-then-validate is the safe loop after any rule change.

## The layout config

The scripts resolve repo layout from an optional `.agents/rule-trace.config.json`. Omit it to accept the conventional defaults:

```json
{
  "rulesDir": ".agents/rules",
  "packageRuleGlobs": ["packages/*/.agents/rules/*.md"],
  "catalogPath": ".agents/rules-catalog.md",
  "metricsDir": ".agents/metrics",
  "severities": ["MUST", "SHOULD", "MAY"],
  "importers": [
    { "path": "CLAUDE.md", "type": "at-import" },
    { "path": "AGENTS.md", "type": "at-import" },
    { "path": ".opencode/opencode.json", "type": "opencode-instructions" }
  ]
}
```

Add a config when the target repo deviates — e.g. a non-monorepo with no `packageRuleGlobs`, a different importer set, or a generated Cursor/Copilot entry point. `importers[].type` is `at-import` (lines like `@path/to/file.md`), `opencode-instructions` (the JSON `instructions` array), or `generated` (materialized canonical content between markers). Generated importers also set `flavor`: `cursor-mdc`, `copilot-md`, or `plain-md`. Importers not present in the repo are skipped with a warning rather than failing the parity/freshness check.

Generated example:

```json
{ "path": ".cursor/rules/rule-trace.mdc", "type": "generated", "flavor": "cursor-mdc" }
```

Run `node <skill>/scripts/sync-importers.mjs --root <repo>` to write generated importers, or add `--check` in CI to fail when canonical rules changed without regeneration.

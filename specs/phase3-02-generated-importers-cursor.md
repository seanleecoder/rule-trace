# Spec 3.2 — Generated importers + modern Cursor support

**Review findings:** DESIGN_REVIEW.md A2 (High), H1 fix. **Effort:** M–L. **Depends on:** spec 2.3 (importer research) — **read its "Findings → 3.2 scope" memo first**; it decides which tools get which treatment. This spec defines the mechanism; 2.3 defines the target list.

## Goal

End the importer-type treadmill and make the cross-tool claim true. Tools that follow file references keep the thin-importer pattern; tools that don't get a `generated` importer: the canonical rule content is materialized into that tool's native entry file by a script, and the validator checks freshness instead of reference parity. Cursor's modern `.cursor/rules/*.mdc` format becomes a supported target.

## Background

- `readImporterImports()` (`skills/rule-trace/scripts/lib/rules.mjs:184-207`) supports two types: `at-import` and `opencode-instructions`. `references/importer-wiring.md:34` concedes `.cursorrules`/copilot files are "outside the parity check".
- The validator's parity check (`validate-rules.mjs:128-162`) compares the file **sets** importers reference — meaningless for tools that need content inlined.
- Config importers come from `.agents/rule-trace.config.json` / `DEFAULT_CONFIG.importers` (`lib/rules.mjs:29-33`).

## Design

### New importer type: `generated`

Config entry: `{ "path": ".cursor/rules/rule-trace.mdc", "type": "generated", "flavor": "cursor-mdc" }` (flavors: `cursor-mdc`, `copilot-md`, `plain-md`; extendable). The generated file contains the **full concatenated content** of every canonical rule file plus the convention file, wrapped in markers:

```
<!-- rule-trace:generated:begin (do not edit between markers; run sync-importers) -->
…materialized content…
<!-- rule-trace:generated:end -->
```

- `cursor-mdc` flavor: prepend the `.mdc` frontmatter the 2.3 memo documents (at minimum `description` and whatever always-apply/glob field the research confirmed), then the markers + content.
- Content outside the markers is user-owned and preserved on regeneration.
- Determinism: same inputs ⇒ byte-identical output (stable file ordering = the sorted order `listRuleFiles()` already returns; no timestamps in the body).

### New script: `scripts/sync-importers.mjs`

- `node sync-importers.mjs [--root <dir>] [--check]`
- Default: (re)write the marker region of every `generated` importer in the config; create the file (with markers) if absent; print created/updated/unchanged per file, in the scaffold script's output style.
- `--check`: write nothing; exit 1 listing any generated importer that is stale (marker region ≠ expected) or missing. This is the CI mode.
- Register in `cli.mjs` as `sync` (COMMANDS map + help text), and in the doc-integrity CLI test's expectations.

### Validator integration

For `generated` importers, `validate-rules.mjs` skips the reference-parity comparison and instead performs the `--check` freshness comparison inline: stale/missing marker region ⇒ **error** ("run `rule-trace sync`"), file absent entirely ⇒ the existing not-found **warning**. Reference-type importers keep today's parity semantics. The parity check now runs over reference-type importers only; if a repo has one reference importer + N generated ones, that's valid (no drift possible among generated files by construction).

## Requirements

1. Implement the `generated` type in `lib/rules.mjs` (a `renderGeneratedImporter(root, config, importer)` used by both the sync script and the validator — one renderer, two callers; never two implementations).
2. Implement `scripts/sync-importers.mjs` + CLI registration.
3. Validator changes as designed above.
4. Update `DEFAULT_CONFIG` **only if** the 2.3 memo says a default is safe; otherwise generated importers are opt-in via config (prefer opt-in — writing into `.cursor/` uninvited is surprising).
5. `scaffold-wiring.mjs`: no changes (sync is its own command; scaffolding stays about CI/hook/gitignore).
6. Docs: `references/importer-wiring.md` gains a "Generated importers" section (when to use which type, the marker contract, the sync/`--check` loop, updating the 2.3 support matrix rows for Cursor/Copilot from "not loaded" to "generated"); `references/catalog-format.md` config section documents the new type + flavors; README Commands section adds `sync`; SKILL.md init/migrate steps mention wiring generated importers for reference-blind tools.

## Acceptance criteria

1. On a fixture with rules + a config declaring a `cursor-mdc` generated importer: `sync-importers.mjs` creates `.cursor/rules/rule-trace.mdc` with valid frontmatter, markers, and all rule content; running it again reports "unchanged" and the file is byte-identical.
2. Editing a rule file then running the **validator** produces a staleness error naming the file; running sync clears it.
3. User content outside the markers survives a re-sync byte-for-byte.
4. `sync --check` exits 1 on stale, 0 on fresh, and never writes.
5. Mixed config (2 `at-import` + 1 `generated`): parity checked between the two reference importers only; generated importer checked for freshness only.
6. `rule-trace sync` dispatches via the CLI; `--help` lists it (doc-integrity CLI test updated and passing).
7. All importer-drift tests from the existing suite still pass unchanged.
8. `npm test` green.

## Tests to add

Fixture-driven tests in `tests/rule-trace.test.mjs` for criteria 1–5 (mkdtemp pattern), plus the CLI-help update. Add a regeneration-determinism test: two syncs on identical input produce identical bytes.

## Out of scope

- Auto-running sync from a hook or from `generate-catalog.mjs`.
- Migrating existing `.cursorrules` **content** into rules (that's the agent-driven `migrate` mode's job; this spec is plumbing).
- Any tool the 2.3 memo did not name.

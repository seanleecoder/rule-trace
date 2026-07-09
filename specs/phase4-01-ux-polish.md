# Spec 4.1 — CLI/UX polish batch

**Review findings:** DESIGN_REVIEW.md U1, U2, A3 (Medium); Q2, Q3 (Low). **Effort:** S. **Depends on:** nothing (if spec 3.2 landed, its `sync` command participates in the vocabulary table).

Five small, independent fixes batched into one task. Implement all five; none is optional.

## R1 — Unify the modes/commands vocabulary (U1)

**Problem:** three near-aligned word lists — SKILL.md *modes* (init, migrate, audit, report), CLI *commands* (validate, parse, report, catalog, scaffold), and the README workflow verbs ("Migrate → Validate → **Collect** → Report", where "Collect" is the CLI's `parse`).

**Change:**

- Add `collect` as the canonical name for the transcript-backfill command in `cli.mjs` (COMMANDS map), keeping `parse` as a permanent, undocumented-in-help alias (help shows `collect` and notes "alias: parse").
- Add a single mapping table to the README (in or near "Core Workflow"):

  | Workflow step | Who runs it | How |
  | --- | --- | --- |
  | Migrate / Init / Audit | agent (skill mode) | ask your agent |
  | Validate | CLI or CI | `rule-trace validate` |
  | Collect | CLI or Stop hook | `rule-trace collect` / hook |
  | Report | CLI | `rule-trace report` |

- Sweep README, SKILL.md, and references for "parse" used as the user-facing verb; switch prose to "collect" (the script filename `parse-traces.mjs` does **not** change — it's an internal path; docs that state the literal script path stay accurate).
- Update the doc-integrity CLI-help test to expect `collect`.

## R2 — Resolve the retirement-vs-gap-warning contradiction (U2)

**Problem:** `references/rule-anatomy.md:36` says retire a rule by deleting it; `validate-rules.mjs:177-193` then warns about the numbering gap forever. Users either renumber (breaking ID immutability) or learn to ignore warnings.

**Change:** config-list tombstones.

- New optional config key `retiredIds: string[]` in `.agents/rule-trace.config.json`.
- Validator: numbers belonging to `retiredIds` fill gaps (no warning); a retired ID that **still has a live heading** is an error ("ROOT-004 is in retiredIds but still defined in <file> — remove the rule or un-retire it"); a retired ID cited in `--lint-file` stays an unknown-ID error (retired means gone).
- `report.mjs`: retired IDs appearing in historical events are counted as known-but-retired — exclude them from `unknownIds`, and list them under a new `flags.retired` entry `{id, candidate, applied}` so history stays interpretable.
- Docs: `rule-anatomy.md` retirement bullet gains the procedure ("remove the heading + catalog row, add the ID to `retiredIds`"); `catalog-format.md` config example gains the key.

## R3 — Config validation (A3)

**Problem:** `loadConfig()` (`lib/rules.mjs:36-45`) spreads unknown JSON over defaults; a typo'd key silently no-ops.

**Change:** after parsing, compare keys against the known set (`DEFAULT_CONFIG` keys + `retiredIds`). Unknown key ⇒ print a warning to stderr naming the key and the closest known key (simple case-insensitive match is fine; no fuzzy library). Wrong basic type for a known key (e.g. `importers` not an array) ⇒ throw with a clear message, same as the existing JSON-parse error path. Warnings must not change exit codes.

## R4 — `expandGlob` loud limits (Q2)

**Problem:** `**` in `packageRuleGlobs` is silently treated as single-level `*`, making deeper rules invisible to the validator — the worst failure mode is a silent one.

**Change:** in `loadConfig()` (or `listRuleFiles()`), if any configured glob contains `**`, print a stderr warning: recursive globs are unsupported; list each directory level explicitly. Document the supported glob shape in `catalog-format.md`'s config section.

## R5 — Transcript-dir miss diagnostics (Q3)

**Problem:** `parse-traces.mjs:35-38` re-implements Claude Code's `~/.claude/projects/<encoded-cwd>` encoding. If the upstream encoding changes, the derived dir may exist but contain no transcripts, and the script reports success over nothing.

**Change:** when the transcript dir exists but zero `.jsonl` files are found **and** `--transcripts` was not passed, print the derived path plus a hint to pass `--transcripts <dir>` explicitly. Exit code unchanged (0).

## Acceptance criteria

1. `rule-trace collect --help`-style dispatch works; `rule-trace parse` still works; CLI help lists `collect` (with alias note) and the doc-integrity test passes.
2. Fixture with rules ROOT-001, ROOT-003 and config `retiredIds:["ROOT-002"]` → validator exits 0 with **no gap warning**; same fixture with ROOT-002 also defined → error; without the config key → today's gap warning (unchanged default).
3. Report on events citing a retired ID: not in `unknownIds`, present in `flags.retired`.
4. Config with `"ruleDirs"` (typo) → stderr warning naming `ruleDirs` and suggesting `rulesDir`; exit code unaffected. Config with `"importers": "CLAUDE.md"` (wrong type) → hard error.
5. Config glob `packages/**/rules/*.md` → stderr warning about `**`.
6. Empty-but-existing transcript dir → output includes the derived path and the `--transcripts` hint.
7. README/SKILL.md/reference sweeps done (no user-facing "parse the transcripts" prose left; retirement + config docs updated).
8. Full suite green, including new tests for criteria 1–6.

## Tests to add

One test per criterion 1–6 in `tests/rule-trace.test.mjs`, following the existing spawn-based fixture patterns. For 4–5, assert on stderr content.

## Out of scope

- Renaming any script file.
- A `doctor` command (review item M2 — separate future spec).
- Supporting `**` for real (explicitly deferred; the warning is the fix).

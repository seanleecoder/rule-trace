# Spec 5.1 — Small correctness batch (post-implementation audit fixes)

**Source:** DESIGN_REVIEW_UPDATE.md findings U2, U3(b), U4, U5, plus the two leftovers from the original review (H2, A6). **Effort:** S total. **Depends on:** nothing. One agent task, one PR — implement all six items; none is optional. (U1, the stale-flag time bomb, is already fixed and is NOT part of this spec.)

Global conventions in [`specs/README.md`](README.md) apply — especially: no dependencies, hermetic tests for every behavior change, docs move with code, the Stop hook never throws, and this repo's own rules in `.agents/rules/` (the validator runs in CI).

## R1 — Retired IDs cited in Deviations leak into live counters (U2)

**Problem:** `skills/rule-trace/scripts/report.mjs` routes retired IDs out of the live counters for `candidate` and `applied`, but the deviations loop (`for (const id of deviations) ensure(id).deviations++`, ~line 172) does not check `retiredIds`. A retired ID cited in a Deviations line creates a phantom entry in the `rules` map — inflating `distinctRulesSeen` — and its waiver count is missing from `flags.retired`.

**Change:** mirror the candidate/applied treatment. Add a `deviations` counter to the `retired` map entries (`{ id, candidate, applied, deviations }`); retired IDs in a deviations list increment that instead of `ensure(id)`. Update the dashboard's "Retired IDs cited in history" line item to include the waived count.

**Test:** extend the existing retired-IDs report test with an event whose `deviations` cites a retired ID; assert it appears in `flags.retired` with the right count and that `distinctRulesSeen` is not inflated.

## R2 — `report.mjs` loads config twice, duplicating config warnings (U3b)

**Problem:** `loadConfig()` prints unknown-key warnings on every call, and `report.mjs` calls it twice — once at top level (for output paths) and once inside `aggregate()` — so every config warning prints twice per run.

**Change:** load config once at top level and pass it into `aggregate(root, opts, config)`. No behavior change otherwise.

**Test:** run report against a fixture with one unknown config key; assert the warning appears exactly once in stderr.

## R3 — `cursor-mdc` frontmatter mixes exclusive attachment modes (U4)

**Problem:** `generatedFrontmatter()` in `skills/rule-trace/scripts/lib/rules.mjs` always emits both `alwaysApply: true` and a `globs:` line. In Cursor's rule semantics these are alternative attachment modes (globs are ignored when alwaysApply is set), so `importer.globs` silently does nothing today.

**Change:** if the importer config provides `globs`, emit `globs:` and `alwaysApply: false` (glob-scoped attachment); otherwise emit `alwaysApply: true` and no `globs` line. Document the two modes in `references/importer-wiring.md`'s generated-importers section and `references/catalog-format.md`'s config docs.

**Note:** this changes generated `.mdc` bytes for importers that configured `globs` — previously synced files become stale by design. Mention in CHANGELOG under Unreleased ("regenerate with `rule-trace sync`").

**Test:** render both variants via `renderGeneratedImporter` and assert the frontmatter: globs-configured → `globs:` present, `alwaysApply: false`; no globs → `alwaysApply: true`, no `globs` line.

## R4 — Document the fenced-lint edge case (U5)

**Problem:** `parseFencedTrace` matches any ```` ```rule-trace ```` fence, so `validate-rules.mjs --lint-file` against format *documentation* (a doc quoting the fenced example with three backticks) lints the example's placeholder IDs.

**Change:** docs only — one sentence where `--lint-file` is documented (README Validation section and/or `references/ci-wiring.md`): lint real trace output, not files that document the trace format; quoted examples inside four-backtick fences are ignored, three-backtick examples are not.

**Test:** none (docs only).

## R5 — Un-waived-gap flag hardcodes `'MUST'` (original H2)

**Problem:** `config.severities` is configurable ("strongest first" per the comment in `DEFAULT_CONFIG`), but `report.mjs` computes the headline gap flag with a literal `severityOf(id) === 'MUST'` (~line 161). A repo customizing severities silently loses the flag.

**Change:** treat `config.severities[0]` as the strongest severity and use it for the gap check. Keep the JSON field names (`unwaivedMust`, `flags.unwaivedMustGaps`) — they are declared stable in the README's Stability section — but document that they refer to the *strongest configured severity*. Dashboard heading: keep "Un-waived MUST gaps" when the strongest severity is `MUST`, else render the configured name (e.g. "Un-waived CRITICAL gaps").

**Test:** fixture with `severities: ["CRITICAL","ADVISORY"]`, a rule with `Severity: CRITICAL`, and a candidate-not-applied-not-waived event; assert the gap flag fires and the dashboard heading names CRITICAL. Assert default-config behavior is unchanged.

## R6 — Stop hook reads the whole transcript every turn (original A6)

**Problem:** `record-trace.mjs` calls `readJsonl(transcriptPath)` on the full session transcript at every Stop; long sessions make this an O(session-length) cost per turn in a hook whose contract is "cheap, never blocks."

**Change:** read a bounded tail first — if the file is larger than 256 KiB, read only the final 256 KiB (`fs.openSync` + `fs.readSync` at an offset; discard the first, likely partial, line before parsing). Walk that tail for the last main-agent assistant message with visible text as today; if the tail contains **no** such record at all, fall back to the full read (a single response larger than the window is possible but rare). Keep the outer never-throw envelope and identical event output.

**Test:** (a) a >256 KiB transcript whose final traced message is at the end — the tail path records it; (b) a >256 KiB transcript whose only assistant record is at the head — the fallback full read still records it. Reuse the existing hook-test machinery (synthetic Stop payload + fixture transcript).

## Acceptance criteria

1. All six items implemented; each has its test (R4 excepted) and all tests pass.
2. `npm test` green; `node skills/rule-trace/scripts/validate-rules.mjs` (repo root) green with zero warnings.
3. The demo regeneration test still passes — R1/R5 must not change the committed demo report (its events cite no retired IDs and its severities are default; verify, don't assume).
4. CHANGELOG Unreleased notes R3 (regenerate synced importers) and R5 (strongest-severity semantics).
5. No new flags, no new commands, no file renames.

## Out of scope

- The `doctor` command (closes U3(a) — a wrong-typed config silently disabling the hook); that is its own future spec.
- Any change to `--lint-file` parsing behavior (R4 is documentation only).
- Log rotation or any storage change beyond R6's read strategy.

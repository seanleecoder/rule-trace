# Implementation specs — rule-trace design-review follow-ups

Phased, agent-ready specs from the [design review](../docs/reviews/2026-07-08-design-review.md), its [post-implementation audit](../docs/reviews/2026-07-10-post-implementation-audit.md), and the [2026-07-13 follow-up review](../docs/reviews/2026-07-13-follow-up-review.md). Each spec is self-contained: an agent should be able to implement it from the spec file alone.

## Status

Phases 1–4 were implemented in PRs #3–#7 and audited in the post-implementation audit (70/70 tests green at audit time; 72/72 as of the follow-up review). Fully-completed spec files have been **removed** — their content lives in git history (`git log -- specs/`) and their outcomes in the audit's scorecard. The 2026-07-13 follow-up review re-verified every remaining spec against the tree: all four are still accurate, and none of the work below has started. What remains here is only actionable work:

| Spec | What remains | Who can do it |
| --- | --- | --- |
| [1.3 Release execution](phase1-03-release-hygiene.md) | Cut v1.3.0: lockstep bump, retro + release tags, `npm publish` (name confirmed available), GitHub releases. Until then `npx rule-trace@1` resolves to nothing. | Maintainer (agent can prep the release PR) |
| [2.3 Importer canary probes](phase2-03-importer-semantics-research.md) | Run the empirical `@`-import probes (Codex critical); upgrade the support matrix from docs-cited to probe-verified; flip this repo's `AGENTS.md` to a generated importer if Codex is reference-blind. | Anyone with the tool CLIs + credentials |
| [4.3 Compliance pilot](phase4-03-compliance-benchmark.md) | Run `evals/compliance/run.mjs --exec` and replace the `PILOT.md` placeholder with real numbers — the highest-value un-run command in the repo. | Anyone with an agent CLI + spend |
| [5.1 Correctness batch](phase5-01-correctness-batch.md) | Six small fixes from the post-implementation audit: retired-deviation counting, double config load, cursor-mdc frontmatter modes, fenced-lint doc note, strongest-severity gap flag, Stop-hook tail read. | Any agent |

Removed (done — see the [audit](../docs/reviews/2026-07-10-post-implementation-audit.md) §1): 1.1 coverage metric · 1.2 report correctness · 2.1 dogfood · 2.2 example + README · 3.1 structured trace · 3.2 generated importers · 4.1 UX polish · 4.2 OSS hygiene. The U1 stale-flag time bomb found in the audit was fixed directly (report `--now`), not spec'd.

Future candidates (not yet spec'd, in ROI order — see the [audit](../docs/reviews/2026-07-10-post-implementation-audit.md) §5 and the [follow-up review](../docs/reviews/2026-07-13-follow-up-review.md) §5): `doctor` command (one-shot "is collection actually working", closes the silent-config failure mode) · PR trace-lint GitHub Action · hosted demo dashboard · org-export seam · a lockstep fix or test for the two diverging CI validate-job snippets (template vs. `references/ci-wiring.md`).

## Global conventions (apply to every spec)

These are non-negotiable repo invariants — they are also this repo's own dogfooded rules under [`.agents/rules/`](../.agents/rules/), enforced by the validator in CI. Violating any of them is a review-blocking defect:

1. **No runtime dependencies.** All scripts run on stock Node ≥ 18 (`node:` builtins only). Do not add anything to `dependencies` or `devDependencies`.
2. **Version lockstep.** `package.json`, `.claude-plugin/plugin.json`, `skills/rule-trace/metadata.json`, and the `version:` frontmatter in `skills/rule-trace/SKILL.md` must carry the same version. A test enforces this (`tests/doc-integrity.test.mjs`). Bump all four together, or none.
3. **Match the existing style:** ES modules, single quotes, no semicolons, 2-space indent, comments that state constraints rather than narrate code.
4. **Every behavior change gets a test** in `tests/` (node:test, hermetic — `fs.mkdtempSync` fixtures and the `CLAUDE_CONFIG_DIR` isolation pattern from `tests/rule-trace.test.mjs`).
5. **Docs move with code.** If a script's flags, output, or file layout changes, update `README.md`, `skills/rule-trace/SKILL.md`, and the relevant `skills/rule-trace/references/*.md` in the same change; update `CHANGELOG.md` under Unreleased for notable behavior changes.
6. **Backward compatibility of the event log.** `.agents/metrics/traces.jsonl` files written by earlier versions must keep aggregating correctly forever. New event fields are additive; readers must tolerate their absence.
7. **The Stop hook must never block or throw.** Any change to `record-trace.mjs` keeps the outer try/catch + `process.exit(0)` envelope and stays cheap per turn.
8. **Run `npm test` and fix all failures before finishing** — and keep `node skills/rule-trace/scripts/validate-rules.mjs` (repo root) green with zero warnings.

## Definition of done (every spec)

- All acceptance criteria in the spec verified (quote the verification output in your summary).
- New/updated tests pass; full suite green.
- Docs updated per convention 5.
- No scope creep: anything under the spec's **Out of scope** heading is untouched.

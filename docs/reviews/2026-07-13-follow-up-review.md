# rule-trace — Follow-up Review (2026-07-13)

Third review in the series, after the [design review](2026-07-08-design-review.md) (2026-07-08), the four implementation phases (PRs #3–#7), and the [post-implementation audit](2026-07-10-post-implementation-audit.md) (2026-07-10, merged in PR #8). Method: re-verified every item the audit left open against the current tree (HEAD `c9e61a1`, the PR #8 merge), ran the full suite and the validator, checked git tags and the npm registry, and re-read the four remaining specs for staleness.

**Verdict: the codebase is in the same healthy state the audit certified — and nothing the audit left open has moved since.** PR #8's substantive deliverables (the `--now` reproducibility flag and the specs pruning) landed with it; no work has landed after it. The remaining gap is unchanged: three real-world steps that need a maintainer or funded agent run, plus one small code batch any agent can do.

---

## 1. Where we stand

- **HEAD:** `c9e61a1` (merge of PR #8). No commits since.
- **Suite:** 72/72 tests pass (audit said 70; PR #8's follow-up commits added two doc-integrity guards for `--now`).
- **Validator:** clean against the repo root, zero warnings.
- What PR #8 delivered beyond the audit document itself:
  - `report.mjs --now <ISO-8601>` — staleness and `generatedAt` derive from a pinned clock; demo artifacts regenerated with a pinned `--now` and the regeneration test now compares byte-exact (defusing the U1 time bomb the audit found).
  - Specs housekeeping: the 8 fully-implemented spec files deleted, the 3 partially-done ones trimmed to remaining work, `specs/phase5-01-correctness-batch.md` added, `specs/README.md` rewritten as a status ledger.
  - `--now` vs `--since` clarified across README, SKILL.md, `references/ci-wiring.md`, and `references/audit.md`.

## 2. Delta since the audit: none of the open items moved

Re-verified each one:

| Item (spec) | Status 2026-07-13 | Evidence |
| --- | --- | --- |
| Release v1.3.0 ([1.3](../../specs/phase1-03-release-hygiene.md)) | **Unstarted** | All four version fields still 1.2.0; `git tag --list` empty (no retro tags either); npm registry returns 404 for `rule-trace` (name still unclaimed); CHANGELOG `[Unreleased]` populated but not cut. |
| Importer canary probes ([2.3](../../specs/phase2-03-importer-semantics-research.md)) | **Unrun** | Codex/Cursor/Copilot matrix rows in `importer-wiring.md` still read "docs-cited; no live probe run"; this repo's `AGENTS.md` is still a thin `@`-import file. |
| Compliance pilot ([4.3](../../specs/phase4-03-compliance-benchmark.md)) | **Unrun** | `evals/compliance/PILOT.md` is still the "no authenticated agent CLI" placeholder. |
| Correctness batch ([5.1](../../specs/phase5-01-correctness-batch.md)) | **All six items still open** | U2 retired-deviations: `report.mjs:183` still calls `ensure(id)` unconditionally. U3(b): config loaded at `report.mjs:359` *and* inside `aggregate()` at `report.mjs:79`. U4: `generatedFrontmatter()` (`lib/rules.mjs:264-274`) still always emits both `alwaysApply: true` and `globs:`. U5: no fenced-lint caveat anywhere in README/SKILL/references. H2: `'MUST'` still hardcoded at `report.mjs:172` and in the dashboard heading at `report.mjs:348`. A6: `record-trace.mjs:52` still reads the whole transcript via `readJsonl` (`lib/rules.mjs:464-478`), no bounded tail. |

All four remaining spec files were checked against the current tree and are **accurate — none is stale, none contradicted by code or docs.** No spec was removed in this round.

## 3. Corrections to prior findings

- **CI-snippet duplication (original R2, audit §3):** the audit repeated "three near-copies." Current count is **two**, and they **diverge**: `templates/wiring/github-actions.yml` uses the vendored path (`node .agents/skills/rule-trace/scripts/validate-rules.mjs`, node-version `'20'`, job name `rule-trace`) while `references/ci-wiring.md` uses `npx rule-trace@1 validate` (job name `rules`); the README carries only a one-liner, not a full job. No doc-integrity test keeps the two in sync. Part of the divergence is intentional (vendored vs. published install paths), but nothing states that, and the node-version/job-name drift is not. Still worth a small fix or a lockstep test; not spec'd.
- **Test count:** 72, not the audit's 70 (two guards added by PR #8's review-feedback commits).
- Housekeeping done in this round: the two earlier reviews moved from the repo root to `docs/reviews/` as dated historical snapshots; `specs/README.md` remains the single living status ledger.

## 4. What's left

Exactly the four specs in [`specs/README.md`](../../specs/README.md):

| Spec | Remaining work | Who can execute |
| --- | --- | --- |
| [1.3 Release](../../specs/phase1-03-release-hygiene.md) | Bump the four lockstep versions to 1.3.0, cut the CHANGELOG, tag (incl. retro v1.1.0/v1.2.0), `npm publish`, GitHub releases | Maintainer (credentialed); an agent can prep the release PR |
| [2.3 Importer probes](../../specs/phase2-03-importer-semantics-research.md) | Run the `@`-import canary probes, upgrade the matrix to probe-verified, flip this repo's `AGENTS.md` to a generated importer if Codex is reference-blind | Anyone with the tool CLIs + credentials |
| [4.3 Compliance pilot](../../specs/phase4-03-compliance-benchmark.md) | Run `evals/compliance/run.mjs --exec` and replace the `PILOT.md` placeholder with real numbers | Anyone with an agent CLI + spend |
| [5.1 Correctness batch](../../specs/phase5-01-correctness-batch.md) | Six small fixes (table above), one PR | **Any agent — the only item executable without credentials or spend** |

## 5. What's next

Order unchanged from the audit §5, and the reasoning still holds:

1. **Cut and publish v1.3.0** — until then the docs' pinned `npx rule-trace@1` resolves to nothing.
2. **Run the compliance pilot** — still the highest-value un-run command in the repo.
3. **Run the importer probes** — the cheapest way to upgrade the flagship cross-tool claim from honest to verified.
4. **Implement spec 5.1** — the small correctness batch; first candidate for the next agent session.
5. **Then the flywheel, in ROI order:** `doctor` command, PR trace-lint GitHub Action, hosted demo dashboard, org-export seam (plus, from §3 above, the small CI-snippet lockstep fix).

**Bottom line:** the audit's "adoption-ready, risks closed" verdict stands; the project is paused at the hand-off line between code an agent can write and steps only a maintainer or funded run can execute. Nothing found in this round changes the plan — it only confirms it.

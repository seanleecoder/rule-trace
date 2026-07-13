# rule-trace — Design Review Update (post-implementation)

*Historical snapshot (2026-07-10, merged in PR #8). For what has and hasn't moved since, see the [follow-up review](2026-07-13-follow-up-review.md) and [`specs/README.md`](../../specs/README.md).*

Follow-up to the [design review](2026-07-08-design-review.md) after all four spec phases landed (PRs #3–#7). Method: audited every merged change against the acceptance criteria in `specs/`, ran the full suite (**70/70 pass**, up from 33), ran the validator against the repo root and `examples/demo` (both clean, zero warnings), inspected the regenerated demo report, and probed the npm registry.

**Verdict: the implementation is substantially complete and high quality.** All ten executive-summary items are done or instrumented; the two Critical/High architectural risks from the original review (the metrics denominator and the free-text trace format) are closed in code. This audit surfaced one urgent latent CI breakage (U1, below), which was fixed in the same PR that carries this document. What remains falls into two buckets: a short list of small correctness nits in the new code, and the follow-through steps that need a human or an agent-with-spend (publish, pilot, probes).

---

## 1. Scorecard — the original top 10

| # | Improvement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Trace-emission coverage metric | ✅ **Done** | `record-trace.mjs` now records every finished response (`traced: true/false`); `report.mjs` computes `coverage {traced, untraced, rate}`, `--min-coverage` guard, dashboard tile + low-coverage banner. Untraced events correctly excluded from rule counts; legacy logs yield `rate: null`. Offline backfill correctly does *not* emit untraced events (comment explains the denominator rationale). |
| 2 | Dashboard screenshot + committed example | ✅ **Done** | `docs/dashboard.png` embedded near the top of the README; `examples/demo/` validates cleanly and its seeded data lights up every flag class (dead 1, never-applied 1, low-rate 3, MUST gaps 2, stale 1, unknown 1, coverage 74%). Regeneration byte-match is enforced by a test — this audit found a latent CI-breakage risk in that test (U1, below), fixed in the same change. |
| 3 | npm publish + tags + CHANGELOG | 🟡 **Prepared, not executed** | `CHANGELOG.md` (1.0.0→1.2.0 + populated Unreleased), `RELEASING.md` runbook, `prepublishOnly` guard, pinned `npx rule-trace@1` snippets all in place. Registry check: `rule-trace` is **available** (404 — unclaimed). The publish, retro tags, and GitHub releases are the maintainer's credentialed steps and have not happened; the docs' `npx rule-trace@1` currently resolves to nothing. |
| 4 | AGENTS.md `@`-import assumption | 🟡 **Documented, not probed** | `importer-wiring.md` now opens with a five-tool support matrix; the Codex row honestly says "no evidence that `@path` includes are expanded; treat `@` lines as text," and the README's cross-tool claim is scoped accordingly. Evidence is docs-cited only — the spec's empirical canary probes were not run ("no live probe run" appears in three rows). The flagship claim is now honest, but still unverified. |
| 5 | Dogfood this repo | ✅ **Done** | `.agents/` with 8 rules across 3 files, generated catalog, `CLAUDE.md`/`AGENTS.md` thin importers, scoped config, validator wired into CI, validated warning-free by a test. README links it as the live example (with an honest caveat that its own `AGENTS.md` expansion is unconfirmed for Codex). |
| 6 | Structured trace + event schema version | ✅ **Done** | Fenced ```` ```rule-trace ```` JSON parsing (`parseFencedTrace`), authoritative-over-prose, last-block-wins, ID-normalized; prose parser kept as permanent fallback; `v:1` stamped on all new events; convention/template/README teach both layers; the label-lockstep doc-integrity test covers parser + docs + template + dogfood convention + grader. |
| 7 | Cursor / generated importers | ✅ **Done** | `type: "generated"` importers with marker-wrapped materialization, `cursor-mdc`/`copilot-md`/`plain-md` flavors, `sync-importers.mjs` + `rule-trace sync --check`, validator freshness errors ("run rule-trace sync"), single shared renderer, user content outside markers preserved. |
| 8 | Report correctness (dedup, stale, `--since`) | ✅ **Done** | Read-side UUID dedup with `duplicateEventsIgnored`; `flags.stale` + `--stale-days`; `--since` with fail-fast validation and `eventsOutsideWindowOrUndated`; dashboard sections for stale and retired. |
| 9 | Vocabulary unification | ✅ **Done** | `collect` is the primary CLI command (`parse` kept as alias), README carries the mode→runner→command mapping table, help text updated and test-enforced. |
| 10 | Compliance-delta benchmark | 🟡 **Instrument done, no numbers** | Three-arm design (prose / traced / ids-only ablation), four temptation fixtures with deterministic committed checks (unit-tested), `evals/compliance/run.mjs` with `--trials`/plan-mode default, shared `evals/lib.mjs` extraction, README section. `PILOT.md` honestly records that no agent CLI was available — **the number the whole exercise exists to produce doesn't exist yet.** |

Beyond the top 10, the smaller spec'd items also landed and verified: retirement tombstones (`retiredIds` — gap warnings suppressed, still-defined-but-retired is an error, historical citations reported under `flags.retired`), config unknown-key/type validation with did-you-mean, the `**`-glob warning, the empty-transcript-dir hint, multi-block `--lint-file`, CONTRIBUTING/SECURITY (claims verified against source)/Stability section/issue+PR templates, and the Node 18/20/22 CI matrix.

---

## 2. New findings from this audit

Reviewing the implementation surfaced one urgent item (fixed in this same PR) and a handful of small ones.

### U1. The demo regeneration test was a time bomb — CI would have started failing ~2026-07-30 — FIXED

- **Severity: High (urgent — deterministic future CI breakage). Status: fixed.**
- **What was happening:** `tests/doc-integrity.test.mjs` ("committed demo report matches a fresh regeneration") deep-equals the committed `examples/demo/.agents/metrics/report.json` against a fresh run, excluding only `generatedAt`. But `flags.stale` was computed from `Date.now()` against the demo's **fixed seeded timestamps** (latest event: 2026-07-05; `--stale-days` default 30). At audit time exactly one rule was stale and the test passed. Around **2026-07-30**, `DEMO-TEST-002` (lastSeen 2026-06-29) would have crossed the threshold, the fresh report would have gained a second stale entry, `deepEqual` would have failed, and CI would have gone red on every branch — with the rest of the report untouched, so it would have looked like mysterious data drift. By early September every demo rule would have been stale.
- **Fix applied:** `report.mjs` now accepts `--now <ISO-8601>`, used for staleness and `generatedAt` instead of the wall clock. The demo artifacts were regenerated with a pinned `--now`, and the regeneration test passes the same pin and compares byte-exact. Report time is now reproducible in general, not just for the demo.

### U2. Retired-ID handling is asymmetric for deviations

- **Severity: Low**
- **What happens:** `report.mjs` routes retired IDs out of the normal counters for `candidate` (line ~150) and `applied` (line ~164), but the deviations loop (line ~172) still calls `ensure(id)` unconditionally. A retired ID cited in a Deviations line creates a phantom entry in the `rules` map — inflating `distinctRulesSeen` — and its waiver count is lost from `flags.retired`.
- **Recommendation:** mirror the candidate/applied treatment: retired deviations increment a `deviations` counter on the `retired` map entry instead. Add one fixture case.
- **Effort: XS.**

### U3. A mistyped config now silently disables live collection

- **Severity: Low–Medium**
- **What happens:** two interacting consequences of the (correct) new config validation in `loadConfig()`. (a) Wrong-typed known keys **throw** — and inside `record-trace.mjs` that throw is swallowed by the never-fail envelope, so a config mistake like `"retiredIds": "ROOT-004"` (string, not array) stops all live recording with zero feedback anywhere; the validator does catch it, but only when someone runs it. (b) Unknown-key warnings print on **every** `loadConfig()` call, and `report.mjs` loads config twice (top level + inside `aggregate()`), so each warning prints twice per run.
- **Recommendation:** (a) is the strongest argument yet for the review's `doctor` command (original M2) — a one-shot "is collection actually working" check; at minimum, mention config validity in the README's "Verify it is working" step. For (b), load config once in `report.mjs` and pass it into `aggregate()`.
- **Effort: XS (b) / S (doctor).**

### U4. `cursor-mdc` frontmatter mixes `alwaysApply: true` with `globs`

- **Severity: Low (nit)**
- **What happens:** `generatedFrontmatter()` always emits both `alwaysApply: true` and a `globs:` line. In Cursor's rule semantics these are alternative attachment modes — globs are ignored when alwaysApply is set — so the emitted frontmatter carries a dead field that will confuse users who set `importer.globs` expecting scoping.
- **Recommendation:** emit `globs` only when the importer config provides one, and drop `alwaysApply` in that case (attachment mode follows from which field is present).
- **Effort: XS.**

### U5. Fenced parsing can pick up documentation examples

- **Severity: Low (edge case)**
- **What happens:** `parseFencedTrace` matches any ```` ```rule-trace ```` fence, including examples inside docs — running `--lint-file` against a file like `convention.md` (which now contains a fenced example citing `ROOT-001`) lints the example's IDs. Four-backtick nesting mostly protects the shipped docs, but user-authored docs quoting the format with three backticks will trip it.
- **Recommendation:** document it ("lint real trace output, not format documentation") — not worth code.
- **Effort: XS (one sentence).**

---

## 3. Still open from the original review

Items the specs deliberately or implicitly left out, unchanged since the original review — none blocking, listed so they aren't forgotten:

- **Compliance pilot numbers** (original M3's payoff): the instrument exists; `PILOT.md` is a placeholder. Needs an authenticated agent CLI and modest spend.
- **Empirical importer probes** (original H1): matrix rows for Codex/Cursor/Copilot say "docs-cited; no live probe run." The canary-probe experiment from spec 2.3 is still the cheapest way to upgrade "honest" to "verified."
- **Stop hook reads the whole transcript per turn** (original A6, Low): unchanged; cost grows with session length.
- **`report.mjs` hardcodes `'MUST'`** (original H2): `config.severities` is customizable but the un-waived-gap flag isn't — a repo with custom severities silently loses the headline flag.
- **Orphan `skills/rule-trace/agents/openai.yaml`** (original P5): still undocumented and unreferenced.
- **CI snippet triplication** (original R2): the validate job still exists in three near-copies (template, ci-wiring.md, README).
- **Scaffold defaults to writing GitHub CI** (original U3): kept as-is by design; revisit at the next major.
- **Ecosystem items** (original M1/M4/M5): PR trace-lint GitHub Action, hosted demo dashboard, org-export seam — all still open, all still good ROI.

---

## 4. Updated risk posture (vs. the original five 2-year risks)

1. **Silent pipeline decay** — *largely mitigated.* Coverage gives the denominator; the fenced format plus `v:1` gives a drift-resistant contract; the low-coverage banner makes "tracing stopped" visible. Residual: U3(a)'s silent-config failure mode; a `doctor` command closes it.
2. **Cross-tool promise failing silently** — *converted from silent to honest.* The matrix and scoped claims mean nobody is misled; generated importers give reference-blind tools a real path. Residual: claims are docs-cited, not probed.
3. **Platform absorption** — unchanged externally, but the project's defensible layer (counters, waivers, coverage, audit) got stronger relative to the commoditizable attachment layer. The compliance benchmark is the differentiator here and is still numberless.
4. **Bus factor / provenance** — *half mitigated.* CONTRIBUTING/SECURITY/templates/Stability exist; the npm name is available but unclaimed and there are still zero tags — until the release executes, the docs advertise an install path (`npx rule-trace@1`) that does not resolve.
5. **Convention tax rejection** — unchanged; the "What It Costs" section answers the static half, the un-run pilot answers the behavioral half.

---

## 5. What's next

In order:

1. **Cut and publish v1.3.0.** Everything is staged: bump the four lockstep locations, move Unreleased in the CHANGELOG, tag (plus the retro `v1.1.0`/`v1.2.0` tags per RELEASING.md), `npm publish` (name confirmed available), GitHub releases. Until this happens, the README's pinned install command is aspirational. Maintainer-credentialed; roughly an hour.
2. **Run the compliance pilot** (`evals/compliance/run.mjs --exec --trials 2`, then `--report`) and replace `PILOT.md` with real numbers, whatever they show. This is the highest-value un-run command in the repo — it produces the only quantitative evidence in this product category.
3. **Run the importer canary probes** for Codex CLI (and Cursor/Copilot if convenient) and upgrade the matrix evidence from docs-cited to probe-verified; flip this repo's own `AGENTS.md` to a generated importer if the Codex probe comes back negative.
4. **Small correctness batch** (one agent task, XS items from §2–3): U2 retired-deviations, U3(b) double config load, U4 frontmatter, U5 doc sentence, plus the leftover H2 MUST-hardcode and the A6 transcript tail-read. Spec'd as `specs/phase5-01-correctness-batch.md`; one PR.
5. **Then the flywheel, in ROI order:** `doctor` command (closes U3(a) and the "why is my report empty" support burden), the PR trace-lint GitHub Action, hosted demo dashboard, org-export seam.

**Bottom line:** the codebase has crossed from "well-crafted personal tool with structural risks" to "adoption-ready with the structural risks closed," and the one latent CI-breakage risk this audit found (U1) is already fixed. The remaining gap is not code — it's execution of the three real-world steps only a maintainer or a funded agent run can do: publish the package, run the pilot, run the probes.

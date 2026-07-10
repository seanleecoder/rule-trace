# Implementation specs — rule-trace design-review follow-ups

Phased, agent-ready specs implementing the top-leverage improvements from [`DESIGN_REVIEW.md`](../DESIGN_REVIEW.md). Each spec is self-contained: an AI agent should be able to implement it from the spec file alone, without reading the full review.

## How to use these specs

Hand one spec file to one agent per task. Specs within a phase are independent unless a **Depends on** line says otherwise. Phases are ordered: finish (or at least land the blocking parts of) a phase before starting the next, because later phases build on earlier outputs.

## Phases

| Phase | Theme | Specs |
| --- | --- | --- |
| **1 — Make the numbers trustworthy** | Correctness and interpretability of the metrics pipeline. No breaking changes. | [1.1 Coverage metric](phase1-01-coverage-metric.md) · [1.2 Report correctness](phase1-02-report-correctness.md) · [1.3 Release hygiene](phase1-03-release-hygiene.md) |
| **2 — Make it adoptable** | Credibility and first-contact assets. | [2.1 Dogfood this repo](phase2-01-dogfood.md) · [2.2 Example + README overhaul](phase2-02-examples-and-readme.md) · [2.3 Importer-semantics research](phase2-03-importer-semantics-research.md) |
| **3 — Close the architectural gaps** | The long-term fragilities, fixed while the installed base is small. | [3.1 Structured trace format](phase3-01-structured-trace.md) · [3.2 Generated importers + Cursor support](phase3-02-generated-importers-cursor.md) |
| **4 — Polish and flywheel** | UX consistency, OSS hygiene, and the benchmark. | [4.1 CLI/UX polish batch](phase4-01-ux-polish.md) · [4.2 OSS hygiene pass](phase4-02-oss-hygiene.md) · [4.3 Compliance-delta benchmark](phase4-03-compliance-benchmark.md) |

Dependency edges that cross phases:

- 2.2 (examples/README) consumes the output of 2.1 (dogfood) and benefits from 1.1/1.2 (coverage + stale appear in the screenshot).
- 3.2 (generated importers) is **scoped by the findings of 2.3** (importer research) — do not start 3.2 before 2.3 is done.
- 3.1 (structured trace) should land before any wide promotion push, so new adopters emit the versioned format from day one.

## Global conventions (apply to every spec)

These are non-negotiable repo invariants. Violating any of them is a review-blocking defect:

1. **No runtime dependencies.** All scripts run on stock Node ≥ 18 (`node:` builtins only). Do not add anything to `dependencies` or `devDependencies`.
2. **Version lockstep.** `package.json`, `.claude-plugin/plugin.json`, `skills/rule-trace/metadata.json`, and the `version:` frontmatter in `skills/rule-trace/SKILL.md` must carry the same version. A test enforces this (`tests/doc-integrity.test.mjs`). Bump all four together, or none.
3. **Match the existing style:** ES modules, single quotes, no semicolons, 2-space indent, comments that state constraints rather than narrate code.
4. **Every behavior change gets a test** in `tests/` (node:test, hermetic — use `fs.mkdtempSync` fixtures and the `CLAUDE_CONFIG_DIR` isolation pattern from `tests/rule-trace.test.mjs:35-36`).
5. **Docs move with code.** If a script's flags, output, or file layout changes, update `README.md`, `skills/rule-trace/SKILL.md`, and the relevant `skills/rule-trace/references/*.md` in the same change. The doc-integrity tests catch dangling script references; you are responsible for prose accuracy.
6. **Backward compatibility of the event log.** `.agents/metrics/traces.jsonl` files written by v1.2.0 must keep aggregating correctly forever. New event fields are additive; readers must tolerate their absence.
7. **The Stop hook must never block or throw.** Any change to `record-trace.mjs` keeps the outer try/catch + `process.exit(0)` envelope and stays cheap per turn.
8. **Run `npm test` and fix all failures before finishing.** 42 tests pass today; your change should leave more passing, never fewer.

## Definition of done (every spec)

- All acceptance criteria in the spec verified (quote the verification output in your summary).
- New/updated tests pass; full suite green.
- Docs updated per convention 5.
- No scope creep: anything under the spec's **Out of scope** heading is untouched.

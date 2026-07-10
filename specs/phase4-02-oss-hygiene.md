# Spec 4.2 — OSS hygiene pass

**Review findings:** DESIGN_REVIEW.md O1 (Medium aggregate), D3, X2 (Low). **Effort:** S. **Depends on:** spec 1.3 (RELEASING.md exists and is referenced here).

## Goal

Remove every checklist-item reason an org evaluator or first contributor bounces: contributor docs, security policy, stability guarantees, issue templates, and a CI matrix that matches the support claim.

## Requirements

### R1 — CONTRIBUTING.md (root)

One page, covering exactly:

- **Setup & test:** clone, Node ≥ 18, `npm test` (no install step — and why: the no-runtime-dependencies invariant).
- **The invariants** (with pointers to the tests that enforce them): dependency-free scripts; version lockstep across `package.json` / `.claude-plugin/plugin.json` / `skills/rule-trace/metadata.json` / SKILL.md frontmatter (`tests/doc-integrity.test.mjs:69-87`); docs move with code; every behavior change gets a hermetic test; the Stop hook never throws/blocks.
- **Tests vs evals:** `tests/` is deterministic and runs in CI; `evals/` drives real agents, costs money, and never runs in CI (`evals/README.md`).
- **Style:** ES modules, single quotes, no semicolons, constraint-comments — match surrounding code.
- **Releases:** link RELEASING.md.
- **Where to start:** link the issue tracker; note that docs/example improvements are welcome.

If this repo has dogfooded (spec 2.1), point at `.agents/rules/` as the canonical statement of these conventions rather than duplicating them — CONTRIBUTING then summarizes and links.

### R2 — SECURITY.md (root)

Short and concrete:

- **Trust model of the Stop hook:** it executes only the script you installed (plugin or vendored copy), reads the local session transcript, writes one local JSONL file under the repo's metrics dir, makes no network calls, and always exits 0. The scripts have zero dependencies — the supply-chain surface is this repo alone.
- **What the tool never touches:** credentials, env secrets, files outside `--root` and the transcript path it is handed.
- **Reporting:** private disclosure via GitHub security advisories on this repo; expected acknowledgment window (e.g. 7 days).

Every claim in the trust-model paragraph must be verified against the current source before writing it (read `record-trace.mjs` and `lib/metrics.mjs`; if any claim is not literally true, fix the wording, not the code).

### R3 — Stability section in README

A short "Stability" section (near Limits) declaring what semver covers:

- **Stable (semver-guarded):** the trace-block convention (prose labels + fenced format if spec 3.1 landed); the rule anatomy and ID grammar (`RULE_ID_RE`); the event JSONL fields; `.agents/rule-trace.config.json` keys; CLI command names and documented flags; validator exit-code semantics.
- **Not covered:** script file paths/internal layout, dashboard HTML/CSS, console output wording, `report.json` field ordering.

### R4 — Issue + PR templates

- `.github/ISSUE_TEMPLATE/bug_report.md` — asks for: install path (skills.sh / plugin / standalone), agent tool + version, the validator/report command run, expected vs actual, and (for metrics bugs) a redacted `traces.jsonl` excerpt.
- `.github/ISSUE_TEMPLATE/rule_convention.md` — for proposals to change the convention/anatomy/format, asking for the compatibility story (old traces/rule sets must keep parsing).
- `.github/pull_request_template.md` — checklist mirroring the CONTRIBUTING invariants (tests added, docs updated, lockstep respected, `npm test` green).

### R5 — CI matrix (X2)

`.github/workflows/ci.yml`: test on Node `18`, `20`, `22` via a strategy matrix (the suite takes ~1.5s; three jobs are cheap). Keep everything else identical. If the suite fails on 18 or 22, fix the incompatibility (report it in your summary) — the `engines` claim must be continuously true.

## Acceptance criteria

1. All five artifacts exist; CONTRIBUTING and SECURITY each fit on one screen-page (~80 lines max each).
2. Every factual claim in SECURITY.md is verifiable in the current source (cite file:line for each in your summary).
3. The Stability list matches reality — cross-check each "stable" item against the docs that define it; no item is listed stable that a current spec plans to break incompatibly.
4. CI runs the 3-version matrix and is green on all three.
5. `npm test` green locally.

## Tests to add

None (this is docs + CI). Optional nice-to-have: a doc-integrity assertion that CONTRIBUTING.md and SECURITY.md exist.

## Out of scope

- GitHub Discussions setup, roadmap docs, code of conduct (add on demand).
- Release automation.
- Any code behavior change beyond a Node-version incompatibility fix surfaced by R5.

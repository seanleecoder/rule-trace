# Spec 1.3 — Release hygiene: npm publish readiness, CHANGELOG, tags, pinned CI snippets

**Review finding:** DESIGN_REVIEW.md X1 (High). **Effort:** S. **Depends on:** nothing. **Human-in-the-loop:** the actual `npm publish` and `git tag` push require the maintainer's credentials — this spec prepares everything and documents the two commands the maintainer runs.

## Goal

Make the package installable and pinnable from the npm registry, with a reconstructable release history, so CI users stop executing unpinned HEAD of a personal GitHub repo.

## Background (current state)

- `package.json` is nearly publish-ready: `name: rule-trace`, `version: 1.2.0`, `bin`, `files: ["skills","hooks",".claude-plugin","README.md","LICENSE"]`, `engines >= 18`.
- There are **zero git tags**, no GitHub releases, and no CHANGELOG, despite the version being 1.2.0 (history shows a `chore: release rule-trace 1.1.0` commit).
- Every documented CI path uses `npx github:seanleecoder/rule-trace validate` (`README.md:139`, `README.md:179`, `skills/rule-trace/references/ci-wiring.md:12,41`) — unpinnable except by SHA, re-clones per run, and reads as a supply-chain smell to org evaluators.
- A version-lockstep test already exists (`tests/doc-integrity.test.mjs:69-87`).

## Requirements

### R1 — Publish readiness

- Add `"prepublishOnly": "node --test tests/*.test.mjs"` to `package.json` scripts so a failing suite blocks publish.
- Run `npm pack --dry-run` and verify the tarball contains exactly: `skills/**` (including templates and references), `hooks/hooks.json`, `.claude-plugin/*`, `README.md`, `LICENSE`, `package.json` — and does **not** contain `tests/`, `evals/`, `specs/`, `DESIGN_REVIEW.md`, or `.github/`. Adjust `files` if anything is off. Paste the file list into your summary.
- Confirm the `bin` entry works from a packed install: `npm pack`, install the tarball into a temp dir, run `<tmp>/node_modules/.bin/rule-trace --help`, expect exit 0 and the help text.
- Check name availability on the registry (`npm view rule-trace`). If the name is taken by an unrelated package, STOP and report back with options (scoped name `@seanleecoder/rule-trace` vs. alternate name) — do not pick one unilaterally, because it changes every doc snippet.

### R2 — CHANGELOG

Create `CHANGELOG.md` (Keep a Changelog format, semver headings) reconstructed from git history. At minimum:

- `1.2.0` — Codex-backed eval support; skill renamed to rule-trace.
- `1.1.0` — catalog generator + turnkey init scaffolding; audit methodology extracted; eval runner + trigger modes; doc/script-integrity guards; scaffold/validate/report fixes with regression tests; trace-block parsing hardened for multiline fields.
- `1.0.0` (or earliest) — initial release: convention, validator, collectors, report, cross-agent install.

Read `git log --oneline` yourself and assign commits to versions sensibly; the `chore: release` and version-bump commits mark the boundaries. Add an `[Unreleased]` section at the top.

### R3 — Pinned install snippets

Replace `npx github:seanleecoder/rule-trace` with `npx rule-trace@1` in:

- `README.md` (Install section CI note, Commands section),
- `skills/rule-trace/references/ci-wiring.md` (§1 and the GitHub Actions snippet),

keeping a one-line alternative for pre-registry users: "or straight from the repo: `npx github:seanleecoder/rule-trace validate` (unpinned — prefer the registry)". Do **not** change `templates/wiring/github-actions.yml` (it uses the vendored-path invocation, which is correct for skills.sh installs) — but re-read it to confirm, and say so in your summary.

### R4 — Release runbook

Create `RELEASING.md` (root) documenting the exact process:

1. Bump the version in all four lockstep locations (list them; note the enforcing test).
2. Update `CHANGELOG.md` (move Unreleased → the new version).
3. `npm test`.
4. Commit `chore: release rule-trace X.Y.Z`, then `git tag vX.Y.Z && git push --tags`.
5. `npm publish` (prepublishOnly runs the suite).
6. Create the GitHub release from the tag, body = the CHANGELOG section.

Also document in RELEASING.md that tags `v1.1.0` and `v1.2.0` should be created retroactively on their release commits (`git log` shows them) — the maintainer runs this, since tag pushes are theirs to make.

## Acceptance criteria

1. `npm pack --dry-run` file list matches R1 exactly.
2. Packed-tarball `rule-trace --help` exits 0 (criterion verified in a temp dir, not the repo).
3. `CHANGELOG.md` exists, covers 1.0.0→1.2.0 + Unreleased, and every claim in it is traceable to a commit.
4. No remaining `npx github:` reference in README or ci-wiring.md except the explicitly labeled unpinned alternative.
5. `RELEASING.md` exists and the four lockstep locations it names match what `tests/doc-integrity.test.mjs:69-87` checks.
6. `npm test` green.

## Tests to add

None required beyond the existing suite (the lockstep test already guards R4's step 1). Optional: extend `tests/doc-integrity.test.mjs` to assert `CHANGELOG.md` contains a heading for the current `package.json` version — nice-to-have, include it if trivial.

## Out of scope

- Actually publishing or pushing tags (maintainer runs RELEASING.md).
- A release automation workflow (can be a later spec).
- Version bump — this spec ships under the current 1.2.0/Unreleased.

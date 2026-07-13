# Changelog

All notable changes to this project are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning.

## [Unreleased]

## [1.3.0] - 2026-07-13

### Added
- Live trace coverage metrics, read-side event deduplication, report staleness detection, and release-readiness documentation.
- Structured fenced `rule-trace` JSON parsing with prose fallback for trace blocks.
- Generated importer support and the `sync` command for reference-blind tools such as Cursor and GitHub Copilot.
- `report.mjs --now <ISO-8601 date>` pins report time (staleness and `generatedAt`) for reproducible runs; the committed demo artifacts and their regeneration test use it so staleness no longer drifts with the wall clock.

## [1.2.0] - 2026-06-29

### Added
- Codex-backed evaluation support for running and grading rule-trace behavior against fixtures.

### Changed
- Renamed the skill to `rule-trace` and updated README positioning and usage examples.

## [1.1.0] - 2026-06-28

### Added
- Catalog generator and turnkey `init` scaffolding for new rule-trace installations.
- Generic audit methodology in `references/audit.md`.
- One-command eval runner with documented trigger modes.
- Upstream test suite, GitHub Actions CI, and doc/script-integrity guards.

### Fixed
- Scaffold, validate, and report regressions covered by tests.
- Trace-block parsing for multiline fields.
- CLI help rendering when template literals contain backticks.

## [1.0.0] - 2026-06-25

### Added
- Initial rule-traceability skill with stable rule IDs, a catalog, trace-block convention, validator, collectors, report/dashboard, and cross-agent installation support for skills.sh and the Claude Code plugin.

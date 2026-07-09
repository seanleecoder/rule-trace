# Repository Rules

## ROOT-001

- Scope: repository scripts
- Applies when: changing files under `skills/rule-trace/scripts/`, package CLI behavior, or tests that execute those scripts
- Severity: MUST
- Rule: Keep runtime scripts dependency-free on Node >= 18 and use `node:` built-ins instead of package dependencies.

## ROOT-002

- Scope: releases and package metadata
- Applies when: changing package version, skill metadata, generated install docs, or release examples
- Severity: MUST
- Rule: Keep the package and skill version references in lockstep across `package.json`, `skills/rule-trace/metadata.json`, `CHANGELOG.md`, and release docs.

## ROOT-003

- Scope: source style
- Applies when: editing JavaScript modules, tests, or skill scripts in this repository
- Severity: SHOULD
- Rule: Follow the existing style: ES modules, single quotes, no semicolons, and explanatory constraint comments for non-obvious edge cases.

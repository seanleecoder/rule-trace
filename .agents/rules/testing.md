# Testing Rules

## TEST-001

- Scope: tests
- Applies when: changing validator, parser, reporter, scaffold, catalog, CLI, or documentation-integrity behavior
- Severity: MUST
- Rule: Add or update hermetic `node:test` coverage under `tests/` for behavior changes, using temporary fixtures rather than mutating the repository.

## TEST-002

- Scope: test isolation
- Applies when: tests touch Claude configuration, generated metrics, importer files, or filesystem fixtures
- Severity: MUST
- Rule: Isolate test state with `mkdtemp`, explicit fixture roots, and `CLAUDE_CONFIG_DIR` or related environment overrides so tests do not read or write developer state.

## TEST-003

- Scope: CI test suite
- Applies when: adding tests, evals, or fixtures that might be nondeterministic or agent-driven
- Severity: SHOULD
- Rule: Keep `npm test` deterministic and dependency-free; agent-driven evals belong under `evals/` and stay out of the default test command.

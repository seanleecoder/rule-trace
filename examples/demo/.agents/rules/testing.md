# Demo Testing Rules

## DEMO-TEST-001

- Scope: tests
- Applies when: changing route behavior, validation, or data transformations
- Severity: MUST
- Rule: Add or update a focused test for changed runtime behavior.

## DEMO-TEST-002

- Scope: test determinism
- Applies when: adding tests that use time, randomness, network, or filesystem state
- Severity: SHOULD
- Rule: Stub time, randomness, network, and filesystem state so tests are deterministic in CI.

## DEMO-TEST-003

- Scope: snapshots
- Applies when: updating UI snapshots or generated fixtures
- Severity: MAY
- Rule: Prefer small semantic assertions over broad snapshots unless the snapshot is the product output.

# Spec 1.3 — Release hygiene (remaining: execute the v1.3.0 release)

**Status:** the preparation work from the original spec is **done** (PR #3 and successors): `CHANGELOG.md` with a populated Unreleased section, `RELEASING.md` runbook, `prepublishOnly` test guard, pinned `npx rule-trace@1` snippets in README/ci-wiring, and `npm pack` contents verified. What remains is the **credentialed execution**, which only the maintainer can do. The npm package name `rule-trace` was confirmed unclaimed on 2026-07-10 (`npm view rule-trace` → 404).

## Remaining work (maintainer)

Follow [`RELEASING.md`](../RELEASING.md) end to end for **v1.3.0**:

1. Bump the four lockstep locations to `1.3.0` (`package.json`, `.claude-plugin/plugin.json`, `skills/rule-trace/metadata.json`, SKILL.md frontmatter) — the doc-integrity test enforces agreement.
2. Move the `[Unreleased]` CHANGELOG entries under `## [1.3.0]` with the release date; add a fresh empty Unreleased.
3. `npm test` → commit `chore: release rule-trace 1.3.0`.
4. Tag `v1.3.0` and push tags. Also create the **retroactive tags** `v1.1.0` and `v1.2.0` on their release commits (`git log --oneline` — the `chore: release` / rename commits mark them).
5. `npm publish` (prepublishOnly runs the suite). Confirm `npx rule-trace@1 validate` resolves afterward — until it does, the README's pinned install command is dead.
6. Create GitHub releases from the tags, bodies from the CHANGELOG sections.

## Acceptance criteria

1. `npm view rule-trace version` returns `1.3.0`.
2. Tags `v1.1.0`, `v1.2.0`, `v1.3.0` exist on the remote; each has a GitHub release.
3. `npx rule-trace@1 validate --root <any migrated repo>` works from a clean machine.
4. CHANGELOG's top released heading matches `package.json` version; Unreleased is empty.

## Notes

- If the registry name is taken by the time of publish, fall back to the scoped `@seanleecoder/rule-trace` and sweep every `npx rule-trace@1` reference in the same change.
- An agent can prepare steps 1–3 as a release PR; steps 4–6 need maintainer credentials.

# Releasing rule-trace

Maintainers run the credentialed publishing and tag-push steps. The repository test suite enforces the version lockstep described below.

## Release process

1. Bump the version in all four lockstep locations:
   - `package.json`
   - `.claude-plugin/plugin.json`
   - `skills/rule-trace/metadata.json`
   - `skills/rule-trace/SKILL.md` frontmatter

   `tests/doc-integrity.test.mjs` checks these values agree with `package.json`.
2. Update `CHANGELOG.md`: move the relevant `[Unreleased]` entries under the new `X.Y.Z` heading and add a fresh empty `[Unreleased]` section.
3. Run `npm test`.
4. Commit the release as `chore: release rule-trace X.Y.Z`.
5. Tag and push the release:

   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

6. Publish to npm:

   ```bash
   npm publish
   ```

   The `prepublishOnly` script runs the full Node test suite before publishing.
7. Create the GitHub release from tag `vX.Y.Z`; use the matching `CHANGELOG.md` section as the release body.

## Release history

The retroactive tags and GitHub releases were created on 2026-07-13:

- `v1.1.0` on `b5aab7c` (`chore: release rule-trace 1.1.0`).
- `v1.2.0` on `4969769` (`feat: add Codex-backed eval support`), the commit where `git log -S "\"version\": \"1.2.0\""` shows the version changed to `1.2.0`.
- `v1.3.0` on `6aa32bb` (`chore: release rule-trace 1.3.0`); `rule-trace@1.3.0` was published to npm.

## Latest release verification

For v1.3.0 on 2026-07-13, `npm test` passed (72/72), `npm pack --dry-run` contained the intended 33 publishable files, `npm view rule-trace version` returned `1.3.0`, and `npx rule-trace@1 validate --root <migrated repo>` passed from a clean temporary directory.

- The tarball intentionally excludes `tests/`, `evals/`, `specs/`, `docs/`, and `.github/`.
- The publishable surface includes the CLI, skill, templates, plugin metadata, hooks, README, and license.

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

## Retroactive tags

This repository already has historical release commits without pushed tags. Maintainers should create and push these tags on the corresponding commits shown by `git log`:

- `v1.1.0` on `b5aab7c` (`chore: release rule-trace 1.1.0`).
- `v1.2.0` on `4969769` (`feat: add Codex-backed eval support`), the commit where `git log -S "\"version\": \"1.2.0\""` shows the version changed to `1.2.0`.

## Current publish-readiness verification notes

For the current `1.2.0` publish-readiness pass, `npm pack --dry-run` was verified to contain exactly the publishable package surface:

- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `LICENSE`
- `README.md`
- `hooks/hooks.json`
- `package.json`
- `skills/rule-trace/agents/openai.yaml`
- `skills/rule-trace/metadata.json`
- `skills/rule-trace/references/audit.md`
- `skills/rule-trace/references/catalog-format.md`
- `skills/rule-trace/references/ci-wiring.md`
- `skills/rule-trace/references/convention.md`
- `skills/rule-trace/references/importer-wiring.md`
- `skills/rule-trace/references/migration-guide.md`
- `skills/rule-trace/references/rule-anatomy.md`
- `skills/rule-trace/scripts/cli.mjs`
- `skills/rule-trace/scripts/generate-catalog.mjs`
- `skills/rule-trace/scripts/lib/metrics.mjs`
- `skills/rule-trace/scripts/lib/rules.mjs`
- `skills/rule-trace/scripts/parse-traces.mjs`
- `skills/rule-trace/scripts/record-trace.mjs`
- `skills/rule-trace/scripts/report.mjs`
- `skills/rule-trace/scripts/scaffold-wiring.mjs`
- `skills/rule-trace/scripts/validate-rules.mjs`
- `skills/rule-trace/SKILL.md`
- `skills/rule-trace/templates/rule-file.md.tmpl`
- `skills/rule-trace/templates/rule-trace.md.tmpl`
- `skills/rule-trace/templates/rules-catalog.md.tmpl`
- `skills/rule-trace/templates/wiring/github-actions.yml`
- `skills/rule-trace/templates/wiring/gitlab-ci.yml`
- `skills/rule-trace/templates/wiring/metrics.gitignore`
- `skills/rule-trace/templates/wiring/stop-hook.settings.json`

The tarball intentionally excludes `tests/`, `evals/`, `specs/`, `docs/`, and `.github/`.

`skills/rule-trace/templates/wiring/github-actions.yml` was re-read during this pass and intentionally left unchanged: the template uses the vendored-path invocation (`node .agents/skills/rule-trace/scripts/validate-rules.mjs`), which is correct for skills.sh installs.

Package name availability remains a maintainer follow-up before publish when this environment cannot query the registry; `npm view rule-trace --json` returned `403 Forbidden` in the sandbox.

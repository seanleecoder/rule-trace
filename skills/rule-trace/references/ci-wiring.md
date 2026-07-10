# Wiring validation and counting into your project

The skill works the moment it's installed. These snippets make it *enforced* and *measured* in your project's toolchain — generalized from a real dogfooding setup. Pick what matches your stack; nothing here is required for the skill to function.

## 1. A validate entry point

The validator lives at `<skill>/scripts/validate-rules.mjs` and defaults `--root` to the current directory. Expose it however your project runs checks.

Node CLI (works without the agent runtime, version-pinnable):

```bash
npx rule-trace@1 validate          # or: validate --no-severity / --lint-file <path>
# Pre-registry fallback (unpinned — prefer the registry): npx github:seanleecoder/rule-trace validate
```

Or a package script (when the skill is vendored/installed at `.agents/skills/`):

```json
{
  "scripts": {
    "rules:validate": "node .agents/skills/rule-trace/scripts/validate-rules.mjs"
  }
}
```

If your repo enforces that every script is documented (or similar), remember to add an entry for the new script there too.

## 2. CI gate

**GitHub Actions** (`.github/workflows/rules.yml`):

```yaml
name: rules
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx rule-trace@1 validate
```

**GitLab CI** (a job alongside your existing lint/test jobs):

```yaml
rules_validate:
  stage: test
  script:
    - node .agents/skills/rule-trace/scripts/validate-rules.mjs
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
```

The validator exits non-zero on any error (broken anchor, orphan/duplicate ID, importer drift, stale generated importer, missing required field), so it fails the pipeline like any other check.

If your config uses generated importers, add an explicit freshness check next to validation so CI tells maintainers the direct fix:

```bash
npx rule-trace@1 sync --check
npx rule-trace@1 validate
```

## 3. Live usage counter (Claude Code)

If installed as a **plugin**, the `Stop` hook ships in `hooks/hooks.json` and is wired automatically. If installed via **skills.sh / standalone**, add it to `.claude/settings.json` — see [`importer-wiring.md`](importer-wiring.md) for the exact snippet. The live hook is what feeds trace coverage by recording traced and untraced finished responses. Either way, counts land in `.agents/metrics/traces.jsonl`; run `<skill>/scripts/report.mjs` to build `report.json` + `dashboard.html`. For a reproducible report (e.g. in a CI artifact you diff run-to-run), pass `--now <ISO-8601 date>` so staleness and `generatedAt` don't drift with the run's wall-clock time.

## 4. Counting for other agents (OpenCode, Codex, …)

There's no cross-agent Stop hook, so collect counts offline from saved transcripts:

```bash
node .agents/skills/rule-trace/scripts/parse-traces.mjs --transcripts <that agent's transcript dir>
node .agents/skills/rule-trace/scripts/report.mjs
```

The collection script dedupes by message UUID, so it's safe to re-run and to combine with the live hook.

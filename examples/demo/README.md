# rule-trace demo

This is a committed, already-migrated example project for rule-trace.
It contains canonical rules, thin importers, seeded trace events, and generated metrics.
Regenerate the rule catalog after editing demo rules.
Validate the demo with (run from the repository root):

```bash
node skills/rule-trace/scripts/validate-rules.mjs --root examples/demo
node skills/rule-trace/scripts/report.mjs --root examples/demo --now 2026-07-10T00:00:00Z
```

`report.json` and `dashboard.html` regenerate byte-identically with the pinned `--now` above (a doc-integrity test enforces it). The pin keeps staleness deterministic against the fixed seeded timestamps — it is chosen so exactly one rule (`DEMO-ROOT-004`) is stale at the default `--stale-days`. If you change the seeded traces, pick a new `--now` that preserves that property and update `DEMO_NOW` in `tests/doc-integrity.test.mjs` to match.

`docs/dashboard.png` (embedded in the repo README) is a screenshot of this demo's `dashboard.html`; regenerate it if the seeded traces change.

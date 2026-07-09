# rule-trace demo

This is a committed, already-migrated example project for rule-trace.
It contains canonical rules, thin importers, seeded trace events, and generated metrics.
Regenerate the rule catalog after editing demo rules.
Validate the demo with:

```bash
node skills/rule-trace/scripts/validate-rules.mjs --root examples/demo
node skills/rule-trace/scripts/report.mjs --root examples/demo
```

`report.json` and `dashboard.html` should match regeneration except for the `generatedAt` timestamp.

`docs/dashboard.png` (embedded in the repo README) is a screenshot of this demo's `dashboard.html`; regenerate it if the seeded traces change.

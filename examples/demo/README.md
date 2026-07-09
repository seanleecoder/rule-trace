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

Screenshot reminder: render `examples/demo/.agents/metrics/dashboard.html` to `docs/dashboard.png` from a dev environment with browser screenshot tooling before the final release/demo polish pass.

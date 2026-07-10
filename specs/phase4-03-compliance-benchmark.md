# Spec 4.3 — Compliance-delta benchmark (remaining: run the pilot)

**Status:** the instrument is **done** (PR #7): three-arm design (prose / traced / ids-only ablation), four temptation fixtures with deterministic, unit-tested checks (`tests/compliance-checks.test.mjs`), `evals/compliance/run.mjs` with `--trials`/plan-mode default/`--report`, shared helpers in `evals/lib.mjs`, and an `evals/README.md` section covering design and integrity rules. What remains is the run: `evals/compliance/PILOT.md` is a placeholder because no authenticated agent CLI was available. **This is the highest-value un-run command in the repo** — it produces the only quantitative evidence in this product category.

## Remaining work

### R1 — Run the pilot

On a machine with an authenticated agent CLI (`claude` and/or `codex`) and modest spend budget:

```bash
node evals/compliance/run.mjs --exec --trials 2
node evals/compliance/run.mjs --exec --trials 2 --report evals/compliance/PILOT.md
```

(Or `--agent codex`, or both agents in separate runs — per-agent results are more informative than pooled.)

### R2 — Commit the result, whatever it shows

Replace the placeholder `PILOT.md` with the generated report: compliance rate per arm, per-fixture breakdown, trace-emission rate for the traced arm, and the disclosed-vs-silent violation split (the "honest waiver" rate). Keep the built-in caveat: n=2 trials is directional, not significant. **Publish a null or negative result exactly as readily as a positive one** — the integrity rules in `evals/README.md` apply.

### R3 — Decide the follow-up from the numbers

- Traced arm clearly ahead → scale trials (`--trials 5+`) toward a publishable number; consider a README "Measured effect" section and linking PILOT.md.
- No delta or prose ahead → that is essential product truth: open an issue discussing whether the convention needs strengthening (e.g. the trace instruction's wording) and temper any compliance-adjacent claims in the README.
- Either way, note the agent + model + version in PILOT.md — the number is model-specific.

## Acceptance criteria

1. `PILOT.md` contains real numbers from `--exec` runs (agent, model, trial count, per-arm compliance rates, waiver split) — no placeholder text remains.
2. Raw results JSON retained locally (git-ignored `evals/compliance/results/` — do not commit).
3. Any README claim touched by the result is consistent with it.

## Notes

- CI never runs this (agent-driven, costs money) — consistent with `evals/README.md`.
- If Codex's `workspace-write` sandbox blocks fixture output paths, rerun with `--codex-sandbox danger-full-access` (throwaway copies only), mirroring the migrate-eval guidance.

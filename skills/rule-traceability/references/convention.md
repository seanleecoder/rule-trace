# The trace-block convention

This is the portable convention an agent follows at response time. It is the de-coupled, project-agnostic version of a repo's `traceability.md`. When you `init` a repo, the template at `templates/traceability.md.tmpl` ships this convention into `.agents/traceability.md`.

## When to include a trace

For planning, implementation, debugging, and review responses, append a `Rule trace` section whenever repository or package rules materially constrained the work — package boundaries, environment setup, validation/tests, workflow choice, source-of-truth placement, or review findings.

Omit it only when no rule materially shaped the response (a purely conversational answer or a trivial command result). A trace on every message is noise; a trace on every *rule-shaped* message is the point.

## Format

```md
Rule trace

- Candidate rules loaded: <linked IDs plausibly in scope>
- Rules applied: <linked IDs that materially constrained the work>
- Sources: <files defining the cited IDs>
- Reasoning note: <why those rules mattered for this result>
- Deviations: <in-scope rule deliberately NOT applied — ID + one-line justification> (omit if none)
```

## Semantics

- **Candidate rules loaded** — rules plausibly in scope for the task, topic, and area. Be honest and inclusive here; the value of the whole system comes from comparing this set to the applied set.
- **Rules applied** — the rules that actually constrained the implementation, review, or recommendation.
- **Sources** — the files where the cited rules are defined.
- **Reasoning note** — why the cited rules mattered, not a restatement of the task.
- **Deviations** — the self-documenting escape hatch. When a candidate rule (especially a MUST or SHOULD) was deliberately *not* applied, name it and give a one-line reason. This converts a silent gap into a reviewable decision. Without it, the counters can't tell "consciously waived" from "ignored".

## Linking

Link every cited ID directly to its defining heading, e.g. `` [`ROOT-003`](rules/root.md) ``, not bare text. The catalog is a discovery aid; the ID itself should jump to the definition.

## Why this works

The trace is **not proof** the model complied — it records what the model *claimed*. Its value is as a review surface: it makes the invisible visible, lets a human challenge a missing application directly, and (via the counters) reveals over time which rules are always-candidate-never-applied. Honesty of the candidate set is what makes the diff meaningful, so the convention asks for an inclusive candidate list rather than a flattering one.

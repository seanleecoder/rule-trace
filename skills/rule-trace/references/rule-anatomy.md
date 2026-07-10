# Rule anatomy and the ID scheme

Every rule is a markdown `##` heading whose text is the **stable ID**, followed by a fixed set of fields. The validator (`scripts/validate-rules.mjs`) enforces the required fields and the catalog↔heading correspondence.

## Anatomy

```md
## ROOT-003

- Scope: repository
- Applies when: formatting code or reviewing style
- Severity: SHOULD
- Rule: Formatting uses single quotes, no semicolons, trailing commas, print width 80. See `.prettierrc`.
```

- **Scope** — where the rule applies (`repository`, a workspace/package name, `tests`, `global`). Drives which tasks list it as a candidate.
- **Applies when** — the trigger condition, phrased as the task context ("installing dependencies", "editing styling imports"). This is what an agent matches against to decide candidacy, so write it as a recognizable situation, not a vague topic. A too-narrow or wrong "Applies when" is the usual cause of a dead rule.
- **Severity** — `MUST` | `SHOULD` | `MAY`. Strength of the obligation. `MUST` gaps (candidate, not applied, not waived) are the report's top-priority signal. Pick the weakest level that's still true; inflating everything to MUST destroys the signal.
- **Rule** — one or more `- Rule:` bullets stating the actionable constraint. Keep each bullet to one enforceable idea; reference concrete files/paths where relevant.

A rule may carry multiple `- Rule:` bullets when they share the same scope and trigger, but if two bullets have different "Applies when" conditions they should be separate IDs.

## The ID scheme

IDs are layered by reach so an agent can tell at a glance how broadly a rule applies:

| Layer | Prefix shape | Example | Lives in |
| --- | --- | --- | --- |
| Repository-wide | `ROOT-NNN` | `ROOT-001` | `.agents/rules/root.md` |
| Topic / area | `<TOPIC>-NNN` | `TEST-002`, `STYLE-004` | `.agents/rules/<topic>.md` |
| Global policy | `GLOBAL-<TAG>-NNN` | `GLOBAL-RC-001` | `.agents/rules/global-*.md` |
| Package-local | `PKG-<PKG>-<AREA>-NNN` | `PKG-EXPO-CODE-003` | `packages/<pkg>/.agents/rules/<area>.md` |

Rules:
- **Numbered sequentially per prefix**, no gaps (the validator warns on gaps). Append new rules at the next number.
- **Immutable once published.** Don't renumber or repurpose an ID — traces, the catalog, and the counters all reference it. To retire a rule, remove the heading from its file, remove its catalog row, and add the ID to `retiredIds` in `.agents/rule-trace.config.json`; historical report counts then appear as retired rather than unknown.
- Keep `root.md` for genuinely cross-cutting facts. A rule that only applies to one area belongs in that area's file, with the matching prefix. Misfiled rules become dead weight in candidate sets.

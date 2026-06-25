# Audit methodology

How to maintain a traceable rule set over time — combining repo state, usage data, and the current session into concrete edits. This is the depth behind the SKILL's `audit` mode; a project can also wrap it in a custom command that supplies its own targets.

## Inputs

- **Rule files** — the `## ID` headings under the rules dir (+ package-local rule files).
- **Importer entry points** — the per-tool files that load the rules (e.g. CLAUDE.md, AGENTS.md, an OpenCode config); checked for alignment.
- **Optional command/skill files** — any custom commands the project keeps, if in scope.
- **Usage report** — `report.json` from `report.mjs` (quantitative evidence). Regenerate it first if stale or missing. Counts are self-reported by the model — a prioritization signal, not proof.
- **Session evidence** — the current chat: repeated corrections, recurring decisions, review comments, cases where a rule was ignored/contradicted/found incomplete.

## Parameters

- `scope` — `rules` (rule files only), `commands` (command files only), or `all` (default).
- `paths` — an allowlist; review only those files/directories.
- `session` — default on; use the current chat as evidence.
- `usage` — default on; read `report.json` when present (see flags below).
- `apply` — when on, implement only low-risk fixes after the audit (see below).

## Method

1. **Inventory** every file in scope.
2. **Build a session-evidence list:** recurring implementation decisions; repeated bug causes or review comments; explicit user corrections that should become standing guidance; rules that were ignored, contradicted, or incomplete.
3. **Verify every factual claim against current repo state:** scripts/config in manifests, build/test config, existence of referenced files and paths, and importer alignment (all importers load the identical set).
4. **Compare** existing guidance against both repo state and session evidence.
5. **Read the usage flags** (when `report.json` is present):
   - `deadRules` (never a candidate) → the rule's `Applies when` is wrong/too narrow, or it's noise → Revise or Remove.
   - `alwaysCandidateNeverApplied` / `lowRate` → miscoped, redundant, or ignored → tighten scope, consolidate, or remove.
   - `unwaivedMustGaps` → a MUST rule was in scope but neither applied nor waived → investigate whether it's ignored or poorly worded.
   - `unknownIds` → a cited ID has no catalog entry (stale or hallucinated) → fix the citing pattern, restore the rule, or correct the catalog.
6. **Classify** each item: `Keep` / `Revise` / `Remove` / `Consolidate` / `Add`.
7. **Look specifically for:** missing or moved referenced files; duplicate rules split across root vs topic/package files; rules too broad for their file; commands whose instructions no longer match repo layout/tooling; session-proven patterns worth codifying; contradictions between current rules and what the session showed was correct.

If `apply` is on, implement only: broken file references; obviously stale statements contradicted by current files; duplicated bullets removable without losing meaning; wording cleanups that improve scope separation; and session-backed additions/removals when the evidence is clear, reusable, and file scope is unambiguous. Do not invent rules the repo doesn't demonstrate.

## Output format

Use exactly these sections; omit a section only if truly none:

```md
### Scope
- reviewed files

### Keep
- `file:line-range — reason`

### Revise
- `file:line-range — what's outdated/unclear — recommended change`

### Add
- `target-file — session/repo evidence — proposed new rule`

### Remove
- `file:line-range — what to remove — why`

### Consolidate
- `file:line-range + file:line-range — overlap — where the surviving guidance should live`

### Apply now
- only if apply is on — the exact low-risk edits made

### Session evidence
- only if session evidence materially informed the outcome
- `source — learned pattern or contradiction — rule impact`
```

## Rules of thumb

- Be concrete and repo-specific; high signal only, no generic best-practice filler.
- Prefer removing incorrect guidance over preserving stale guidance.
- Keep root files focused on cross-cutting facts; keep topic/package files focused on context-specific behavior.
- Convert session lessons into durable rules only when they're likely to help in future sessions.
- Prefer modifying or deleting contradictory rules over adding exception-heavy wording.
- New rules must be specific, testable from repo/session evidence, and placed in the narrowest correct file.
- After any rule change, re-run the validator and regenerate the catalog.

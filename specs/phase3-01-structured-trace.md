# Spec 3.1 — Structured trace emission with prose fallback

**Review finding:** DESIGN_REVIEW.md A1 (High; Critical long-term). **Effort:** M. **Depends on:** spec 1.2 (event `v` field) ideally landed; not blocking.

## Goal

Replace "regex vs. model drift" with a stable contract. Agents are asked to append a small fenced, machine-readable block alongside the human-readable trace; the parsers read the fenced block first and fall back to today's prose parsing. Old transcripts, old rule sets, and agents that only emit prose keep working forever.

## Background (current behavior)

- `parseTraceBlock()` (`skills/rule-trace/scripts/lib/rules.mjs:215-259`) locates a `Rule trace` line and extracts IDs under three English labels ("Candidate rules loaded", "Rules applied", "Deviations") with lenient bullet/bold/indent handling. Any label rephrasing by a model silently yields no data.
- The same English labels are independently hardcoded in `evals/grade.mjs:61-68` and in the templates (`templates/rule-trace.md.tmpl`, `references/convention.md`) with no lockstep test.
- Consumers of `parseTraceBlock`: `record-trace.mjs`, `parse-traces.mjs` (via `eventFromAssistant`), and `validate-rules.mjs --lint-file`.

## The format

A fenced code block with info string `rule-trace`, containing a single JSON object, appended **after** the human-readable trace:

````md
Rule trace

- Candidate rules loaded: [`ROOT-001`](rules/root.md), [`TEST-001`](rules/testing.md)
- Rules applied: [`ROOT-001`](rules/root.md)
- Reasoning note: dependency commands were involved.
- Deviations: [`TEST-001`](rules/testing.md) — docs-only change.

```rule-trace
{"v":1,"candidate":["ROOT-001","TEST-001"],"applied":["ROOT-001"],"deviations":["TEST-001"]}
```
````

Rules of the format:

- `v` (number, required), `candidate`/`applied`/`deviations` (arrays of ID strings; each may be omitted ⇒ empty). Unknown keys are ignored (forward compat).
- IDs must match `RULE_ID_RE`; non-matching entries are dropped, not fatal.
- The human-readable block remains the primary artifact (it's what reviewers read); the fenced block is the data layer. Renders as a small code block — acceptable and explicit. (An HTML-comment carrier was considered and rejected: invisible payloads are harder for reviewers to audit and for agents to learn from examples.)

## Requirements

### R1 — Parser

In `lib/rules.mjs`:

- New function `parseFencedTrace(text)`: find ` ```rule-trace ` fences (tolerate leading whitespace and up to 4 backticks), take the **last** such block in the text (an agent correcting itself emits the final word), `JSON.parse` its body. On parse failure or non-object → `null`. Validate/normalize per the format rules; dedupe IDs.
- `parseTraceBlock(text)` becomes: `parseFencedTrace(text) ?? <existing prose logic>`. Same return shape `{candidate, applied, deviations}` so all three consumers are unchanged.
- When a fenced block parses, the prose block (if also present) is **ignored** — no merging, the fenced block is authoritative. Document this in the function comment.

### R2 — Convention + templates + skill docs

Update all four places that teach the format, keeping them in lockstep:

- `references/convention.md` — add the fenced block to the Format section with the "why" (machine-stable across model drift; the prose stays for humans).
- `templates/rule-trace.md.tmpl` — same addition (this is what lands in consuming repos).
- `skills/rule-trace/SKILL.md` — one sentence in the intro/Counters.
- `README.md` — extend the "After" example (`README.md:74-84`) with the fenced block.

### R3 — Lint mode handles both + multiple blocks

`validate-rules.mjs --lint-file` (this folds in review finding Q1): lint **all** trace blocks in the file, not just the first — iterate fenced blocks and prose blocks; report per-block unknown IDs. Keep the exit-1-on-unknown-ID behavior.

### R4 — Grader + lockstep test

- `evals/grade.mjs`: `conventionHasTraceTemplate` additionally accepts a convention file that documents the fenced format (checks for `` ```rule-trace `` presence alongside the existing fields — both should be present after R2, since the template teaches both).
- New test in `tests/doc-integrity.test.mjs`: the prose labels (`Candidate rules loaded`, `Rules applied`, `Deviations`) and the fence tag (`rule-trace`) appear in **all** of: `lib/rules.mjs` (as parse targets), `references/convention.md`, `templates/rule-trace.md.tmpl`, and `evals/grade.mjs` — so no future edit can desync the teaching docs from the parsers.

## Acceptance criteria

1. A message with **only** a valid fenced block parses correctly (arrays extracted, deduped).
2. A message with **both** fenced and prose blocks returns the fenced data even where they disagree.
3. A message with a malformed fenced block (bad JSON) falls back to the prose block; with neither → `null` (existing tests keep passing untouched).
4. Two fenced blocks in one message → the last wins.
5. Fenced parsing flows end-to-end: a crafted transcript through `record-trace.mjs` and `parse-traces.mjs` yields identical events to the prose equivalent.
6. `--lint-file` on a file with two trace blocks flags an unknown ID in the second block.
7. All existing `parseTraceBlock` tests pass unmodified (backward compat is the point).
8. Lockstep test (R4) passes, and demonstrably fails if a label is changed in one place (verify locally, then revert).
9. `npm test` green.

## Tests to add

Unit tests in `tests/rule-trace.test.mjs` for criteria 1–4 (pattern: the existing `parseTraceBlock` tests at lines 63-103); an end-to-end hook/parse test for 5 (reuse spec 1.1's transcript-fixture machinery if it landed); a lint test for 6 (pattern: lines 194-204); the doc-integrity lockstep test for 8.

## Out of scope

- Deleting or deprecating the prose parser — it is the permanent fallback.
- Event log format changes beyond what 1.1/1.2 already did.
- Retro-parsing old transcripts (the offline parser handles that automatically by re-running).

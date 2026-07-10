# Spec 2.3 — Research: what do non-Claude tools actually do with `@`-imports?

**Review finding:** DESIGN_REVIEW.md H1 (High). **Effort:** S. **Depends on:** nothing. **Type:** research + documentation — the only code change is a possible warning. **Blocks:** spec 3.2 is scoped by this spec's findings; do not start 3.2 first.

## Goal

The system's central cross-tool claim is that thin `@`-import entry points keep every agent tool "loading the same canonical rule files" (`README.md:29`, `references/importer-wiring.md:5`). But `@path` import syntax is a Claude Code feature; the AGENTS.md convention is plain markdown with no include directive. This spec establishes, per tool, whether an `@.agents/rules/root.md` line in `AGENTS.md` results in the rules actually entering the tool's context — and documents the truth.

## Method

For each tool below, determine the behavior by (in order of preference): official docs, the tool's public source code, or an empirical probe. An empirical probe = a scratch repo whose `AGENTS.md` contains only an `@`-import of a rule file containing a distinctive canary instruction ("always begin your reply with the word PINEAPPLE"), then one non-interactive run of the tool asking a trivial question; canary present ⇒ imports followed.

Tools to cover (all are named in this repo's docs or defaults, `lib/rules.mjs:29-33`, `references/migration-guide.md:8`):

1. **Claude Code** (`CLAUDE.md`, `AGENTS.md`) — expected: follows `@`-imports; confirm and note nesting behavior (the docs already warn about nested imports, `importer-wiring.md:32`).
2. **OpenAI Codex CLI** (`AGENTS.md`) — the critical unknown.
3. **OpenCode** (`.opencode/opencode.json` `instructions` array) — expected: loads listed files; confirm the array semantics (globs allowed? relative to repo root?).
4. **Cursor** (`.cursorrules` legacy + `.cursor/rules/*.mdc`) — does either mechanism follow file references at all?
5. **GitHub Copilot** (`.github/copilot-instructions.md`) — same question.

If a tool cannot be run in the available environment, say so explicitly and fall back to docs/source citations — never present an assumption as a finding.

## Deliverables

### D1 — Support matrix in `references/importer-wiring.md`

A table at the top of the Importers section:

| Tool | Entry point | Reference mechanism | Rules actually loaded? | Evidence |
| --- | --- | --- | --- | --- |

with one row per tool, `Evidence` linking docs/source or naming the probe. Rewrite the surrounding prose to match reality: if (as expected) some AGENTS.md consumers do **not** follow `@`-lines, the doc must say plainly that for those tools the thin-importer pattern means the rules are *not* loaded, and point at the interim workaround (inline the rules manually / duplicate content) plus the planned fix (generated importers, spec 3.2).

### D2 — Corrected claims elsewhere

Audit and correct every cross-tool loading claim: `README.md:29` ("Keep multiple agent tools loading the same canonical rule files"), `README.md:7`, `SKILL.md` init step 3, `references/migration-guide.md` §5. Claims must be scoped to the tools where they are true.

### D3 — Validator warning (only if the finding warrants it)

If the research confirms that a configured `at-import` importer belongs to a tool known not to follow `@`-lines (i.e. `AGENTS.md` when the repo's tool set includes such a consumer), add a **warning** (never an error) to `validate-rules.mjs`: the parity check verifies the files *agree*, not that every tool *loads* them — with a pointer to the support matrix. Keep it to a couple of lines; if the finding is nuanced (e.g. behavior varies by version), prefer docs-only and skip the code change.

### D4 — Scope memo for spec 3.2

Append a short "Findings → 3.2 scope" section to **this spec file** (specs are living docs here): which tools need a `generated` importer type, which are fine with references, and any format details discovered (e.g. `.mdc` frontmatter fields) that 3.2 must honor.

## Acceptance criteria

1. The matrix covers all five tools with an evidence citation each; no cell says "probably".
2. Every doc claim identified in D2 is either verified-true or corrected.
3. Any tool that silently ignores `@`-imports is explicitly called out in `importer-wiring.md` with the interim workaround.
4. The 3.2 scope memo exists in this file.
5. `npm test` green (plus a test for D3's warning if implemented, following the warning-test pattern at `tests/rule-trace.test.mjs:589-599`).

## Out of scope

- Implementing generated importers or any new importer type (spec 3.2).
- Testing tools not named in this repo's docs.
- Changing default config (`DEFAULT_CONFIG.importers`) — behavior stays; only truth-in-documentation changes.

## Findings → 3.2 scope

- Claude Code can stay on thin `@` importers for `CLAUDE.md`; generated importers should avoid nested imports because only Claude Code reliably expands them recursively.
- OpenCode can stay on `.opencode/opencode.json` with an `instructions` array that lists canonical files directly; generated output should preserve a flat list and may use OpenCode-supported globs only when all matched files are intentional.
- OpenAI Codex CLI / `AGENTS.md`, Cursor, and GitHub Copilot need generated or inlined native instruction files because the documented formats treat their entry points as instruction text/rule files, not include-capable manifests.
- Cursor generation must target `.cursor/rules/*.mdc` with the frontmatter/description shape required by Cursor rules, while Copilot generation must target `.github/copilot-instructions.md` as repository instructions.

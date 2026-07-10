# Spec 2.3 — Importer semantics (remaining: run the empirical canary probes)

**Status:** the documentation half is **done** (PR #5): `references/importer-wiring.md` opens with a five-tool support matrix, the README's cross-tool claims are scoped honestly, and the "Findings → 3.2 scope" memo below informed the generated-importers implementation (spec 3.2, shipped). But three matrix rows — **Codex CLI, Cursor, GitHub Copilot** — carry evidence marked "docs-cited; no live probe run". The remaining work is the empirical probe that upgrades those cells from *honest* to *verified*, plus acting on the result.

## Remaining work

### R1 — Run the canary probes

For each of Codex CLI (critical), Cursor, and Copilot (if runnable): a scratch repo whose entry point (`AGENTS.md` / `.cursorrules` / `.github/copilot-instructions.md`) contains **only** an `@`-import of a rule file with a distinctive canary instruction ("always begin your reply with the word PINEAPPLE"), then one non-interactive run asking a trivial question. Canary present ⇒ that tool expands references; absent ⇒ confirmed reference-blind. Run each probe twice to guard against stochastic compliance. Record tool versions.

Requires the tool CLIs and their credentials — this is why it hasn't run yet. If a tool still cannot be run, leave its row docs-cited and say so; never present an assumption as a probe result.

### R2 — Update the matrix

Replace "docs-cited; no live probe run" in each probed row of `references/importer-wiring.md` with the probe result and tool version (e.g. "probe-verified 2026-07, codex-cli vX.Y: canary absent — `@` lines are inert text").

### R3 — Act on the Codex result

- **If Codex does not expand `@`-imports (expected):** flip this repo's own root `AGENTS.md` from an `@`-import file to a `generated` importer (the machinery exists: config entry + `rule-trace sync`), and remove the "expansion is unconfirmed" caveat from the README's dogfooding paragraph in favor of the verified statement. Consider the same guidance in SKILL.md's init/migrate steps.
- **If Codex does expand them:** update the matrix and strengthen (rather than weaken) the README claim, and note the Codex version the behavior was verified on.

## Acceptance criteria

1. At least the Codex row's Evidence cell cites a live probe with a tool version; no probed row says "docs-cited" anymore.
2. This repo's `AGENTS.md` strategy matches the Codex probe result (generated importer, or verified `@`-imports).
3. README/SKILL.md claims are consistent with the updated matrix.
4. `npm test` green; repo-root validator green with zero warnings (the importer config change in R3 must keep parity/freshness checks passing).

## Findings → 3.2 scope (historical — consumed by the shipped spec 3.2)

- Claude Code can stay on thin `@` importers for `CLAUDE.md`; generated importers should avoid nested imports because only Claude Code reliably expands them recursively.
- OpenCode can stay on `.opencode/opencode.json` with an `instructions` array that lists canonical files directly; generated output should preserve a flat list and may use OpenCode-supported globs only when all matched files are intentional.
- OpenAI Codex CLI / `AGENTS.md`, Cursor, and GitHub Copilot need generated or inlined native instruction files because the documented formats treat their entry points as instruction text/rule files, not include-capable manifests.
- Cursor generation must target `.cursor/rules/*.mdc` with the frontmatter/description shape required by Cursor rules, while Copilot generation must target `.github/copilot-instructions.md` as repository instructions.

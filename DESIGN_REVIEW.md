# rule-trace — Design Review

A Staff/Principal-level pre-1.0-style review of the whole repository: product, architecture, code, docs, DX, and open-source readiness. Method: every file in the repo was read (scripts, shared library, references, templates, all three test files, the eval harness, and the manifests), and the test suite was run (33/33 pass).

**Overall assessment.** This is an unusually well-built small project. The scripts are dependency-free and portable, the failure modes are thought through (non-destructive scaffolding, double-wired-hook detection, UUID-deduped collectors), the docs are honest about the core epistemic limit ("self-reported, not proof"), and the test suite covers real regressions with hermetic fixtures. The review therefore concentrates on leverage: the handful of gaps that decide whether this becomes a widely adopted convention or stays a well-crafted personal tool. The two biggest are (1) the metrics pipeline has no denominator — trace *emission* is never measured, so every downstream flag is confounded — and (2) the pipeline's input format is "whatever prose the model writes," which is the project's largest long-term fragility.

Severity scale: Critical / High / Medium / Low / Nice-to-have. Effort scale: XS / S / M / L / XL.

---

## 1. Product

### P1. Trace-emission coverage is unmeasured — the denominator problem

- **Severity: Critical** (it undermines the product's core promise)
- **Why it matters:** Every metric the system produces — dead rules, low application rate, un-waived MUST gaps — assumes the agent emitted a trace block on rule-shaped responses. Nothing measures how often it didn't. `record-trace.mjs:56-66` walks backward to the most recent assistant message *that carries a trace* and silently records nothing otherwise; `report.mjs` has no notion of "responses without traces." Long sessions, context compaction, model changes, or the convention file simply falling out of the loaded context all silently zero the emission rate — and the report then reads as "all rules are dead," indistinguishable from a genuinely dead rule set. The README even warns users about a related trap ("a report run before any traces are collected flags every catalogued rule as dead," `README.md:42`) without offering the instrument that would disambiguate it.
- **Recommendation:** Record a lightweight event for *every* main-agent Stop (e.g. `{uuid, traced: false}`) or at least a per-session counter, and surface a **coverage** stat in `report.json`/dashboard: "N of M substantive responses carried a trace (X%)." Gate the other flags on a minimum coverage so the dashboard can say "coverage too low to interpret" instead of "everything is dead."
- **Effort: S** (the Stop hook already sees every response; the report needs one new stat and a guard)
- **Expected impact:** Turns every existing metric from "plausible" to "interpretable." This is the single highest-leverage change in the repo.

### P2. The right problem, and a genuinely novel framing — but the payoff curve is back-loaded

- **Severity: Medium**
- **Why it matters:** The candidate-vs-applied diff with waiver semantics is a real insight nobody else ships (see §9). But the headline payoff (the usage report) needs weeks of traces, while the cost (migration, importer rewiring) is upfront. The immediate, day-one win — reviewable trace blocks in PR-shaped responses — is present in the README's Before/After section but not framed as the adoption hook.
- **Recommendation:** Restructure the README's value narrative into two tiers: "today: every agent response becomes reviewable (click the ID, see the rule)" and "over weeks: the counters tell you which rules to delete." Lead with tier one.
- **Effort: XS**
- **Expected impact:** Lowers the perceived adoption threshold from "instrument my repo for a month" to "get better PR reviews this afternoon."

### P3. The repo does not dogfood its own system

- **Severity: High**
- **Why it matters:** The repository has no `CLAUDE.md`, no `AGENTS.md`, no `.agents/` — the project that sells rule traceability has no traced rules of its own. This costs twice: credibility (a first-time visitor who checks will notice), and a missing living example — there is no committed repo anywhere that shows the end state (eval outputs are git-ignored; fixtures are inputs only).
- **Recommendation:** Run `init`/`migrate` on this repo itself: a small `.agents/rules/` set (the project has genuine rules: dependency-free scripts, version lockstep, test conventions), a catalog, importers, the validator wired into the existing `.github/workflows/ci.yml`. Link it from the README as "this repo uses itself."
- **Effort: S**
- **Expected impact:** Instant credibility, a permanent example, and the maintainer becomes the first user to hit every rough edge.

### P4. Token and context cost is never addressed

- **Severity: Medium**
- **Why it matters:** The skeptical engineer's first question is: "what does loading N rule files plus emitting a trace block on every substantive response cost me, and does it degrade the actual work?" The docs answer the epistemics question thoroughly (self-reported limits, `README.md:263-265`) but never the economics question. Unanswered, it reads as an unbounded tax.
- **Recommendation:** Add a short "Cost" subsection to the README: typical trace block is ~50-80 tokens; rule files are loaded anyway (they replace the prose that was already in CLAUDE.md); the convention file adds a few hundred tokens once. Even rough numbers beat silence.
- **Effort: XS**
- **Expected impact:** Removes a silent adoption blocker.

### P5. Nothing needs removing; one thing needs explaining

- **Severity: Low**
- **Why it matters:** The feature set is admirably restrained for a v1.2 — no config sprawl, no premature plugin system. The one unexplained artifact is `skills/rule-trace/agents/openai.yaml`, which appears in no doc, no test, and no script. Orphan files in a small repo draw disproportionate reviewer attention.
- **Recommendation:** Either document what consumes it (presumably an agent-registry manifest) in a comment or the README, or remove it.
- **Effort: XS**
- **Expected impact:** Small, but orphan-free repos read as maintained.

---

## 2. Repository structure

### R1. Layout is sound — keep it

The structure is clean and justified: `skills/rule-trace/{SKILL.md,scripts,references,templates}` is the shape both skills.sh and the Claude Code plugin format require; `tests/` and `evals/` at the root correctly separate "deterministic guards that run in CI" from "behavioral evals that cost money"; `hooks/` and `.claude-plugin/` are where the plugin loader expects them. Module boundaries inside `scripts/` are right: `lib/rules.mjs` (parsing/scanning) and `lib/metrics.mjs` (event storage) are shared by all four entry points, and `cli.mjs` is honestly a dispatcher with "no logic lives here" (`cli.mjs:4`). No reorganization recommended.

### R2. One duplication risk: the CI snippet exists in three places

- **Severity: Low**
- **Why it matters:** The GitHub Actions validate job appears in `templates/wiring/github-actions.yml`, in `references/ci-wiring.md:31-42`, and in README prose. They already differ slightly (the reference uses `npx github:<owner>/rule-trace`, the template uses the vendored path). Drift here produces the exact class of doc-rot the project exists to prevent.
- **Recommendation:** Make the reference doc embed-or-point-to the template as the single source, or add a doc-integrity test asserting the snippets stay equivalent (the repo already has the right harness for this in `tests/doc-integrity.test.mjs`).
- **Effort: XS**
- **Expected impact:** Prevents an embarrassing category of drift for a drift-detection tool.

---

## 3. Architecture

### A1. The pipeline's input format is free-form English — the biggest long-term fragility

- **Severity: High** (Critical over a multi-year horizon)
- **Why it matters:** `parseTraceBlock` (`skills/rule-trace/scripts/lib/rules.mjs:215-259`) parses a loose markdown convention: a "Rule trace" line, English field labels ("Candidate rules loaded", "Rules applied", "Deviations"), optional bold/bullets/indentation. The parser is admirably lenient, but the contract is "whatever prose the model writes," and model drift is guaranteed across versions and vendors. When a model rephrases a label ("Rules considered:"), the pipeline silently records nothing — which, absent P1's coverage metric, is invisible. The same English labels are independently hardcoded in `evals/grade.mjs:61-68` and the templates, with no lockstep test.
- **Recommendation:** Introduce an optional machine-readable emission alongside the human-readable one — a fenced ` ```rule-trace ` block carrying `{"v":1,"candidate":[…],"applied":[…],"deviations":[…]}` that the convention asks agents to append. Parse it first; fall back to the current prose parser. Version the event schema (`"v":1` in each JSONL event) at the same time — it costs one field now and prevents a painful migration later. Add a test asserting the labels in `parseTraceBlock`, `grade.mjs`, SKILL.md, and the templates agree.
- **Effort: M**
- **Expected impact:** Converts the system's weakest joint from "regex vs. model drift" to a stable contract, without losing human readability.

### A2. Importer extensibility is closed where the market is open

- **Severity: High**
- **Why it matters:** `readImporterImports` (`lib/rules.mjs:184-207`) supports exactly two importer types: `at-import` and `opencode-instructions`. The README's pitch names Cursor (`README.md:7`), but `.cursorrules` has no importer type, and Cursor's current-generation format — `.cursor/rules/*.mdc` with frontmatter globs — is never mentioned anywhere. `references/importer-wiring.md:34` quietly concedes these are "outside the parity check." The drift guard is the validator's flagship feature; the most popular third tool is outside it.
- **Recommendation:** Add importer types for `.cursor/rules/` (and `.github/copilot-instructions.md`), or — cheaper and more general — add a `generated` importer type where the tool *writes* the entry-point file from the canonical rule set (inlining the rules rather than referencing them). Generation sidesteps per-tool import semantics entirely and also resolves H1 below.
- **Effort: M** (per-tool parsing) or **S** (the generated/inline approach)
- **Expected impact:** Makes the cross-tool story true for the tools people actually use.

### A3. Config is merged but never validated

- **Severity: Medium**
- **Why it matters:** `loadConfig` (`lib/rules.mjs:36-45`) does `{...DEFAULT_CONFIG, ...parsed}`. A typo'd key (`"ruleDirs"` for `"rulesDir"`) silently falls back to defaults — in a tool whose brand is deterministic validation, a config typo producing wrong-but-green results is off-brand.
- **Recommendation:** Warn (or error) on unknown top-level keys and on wrong-typed known keys. ~15 lines, no dependencies needed.
- **Effort: S**
- **Expected impact:** Closes the one silent-misconfiguration hole in an otherwise loud toolchain.

### A4. Aggregation trusts the write-side dedup it can't guarantee

- **Severity: Medium**
- **Why it matters:** Dedup-by-UUID happens only at write time (`lib/metrics.mjs:51-59`: read existing UUIDs, filter, append). Two concurrent writers — the live Stop hook firing while `parse-traces.mjs` backfills, or two Claude sessions in the same repo — can interleave read-then-append and both write the same UUID. `report.mjs:80` then iterates events with no read-side dedup, double-counting. The comment in `metrics.mjs:5-7` ("counts can always be recomputed") already implies the right fix.
- **Recommendation:** Dedupe by UUID in `aggregate()` before counting. Three lines; makes the append-only log's promise ("recomputable on read") actually hold.
- **Effort: XS**
- **Expected impact:** Correctness under the exact concurrent setup the docs recommend (hook + backfill together, `references/ci-wiring.md:71`).

### A5. The report promises staleness but doesn't compute it

- **Severity: Medium**
- **Why it matters:** `README.md:14` promises "dead, broad, skipped, or **stale** rules become visible." `report.mjs` tracks `lastSeen` per rule (`report.mjs:93-94`) but the flags (`report.mjs:127-144`) have no staleness entry, and there is no time windowing at all — no `--since`, no trend. A rule applied 50 times three months ago and never since looks healthier than a rule applied 3 times this week.
- **Recommendation:** Add a `stale` flag (candidate > 0 but `lastSeen` older than a threshold, default ~30 days) and a `--since <date>` window on aggregation. Both are small because `lastSeen` and timestamps already exist in the events.
- **Effort: S**
- **Expected impact:** Delivers a documented promise; makes the report useful for rule sets older than one adoption burst.

### A6. The Stop hook re-reads the entire transcript every turn

- **Severity: Low**
- **Why it matters:** `record-trace.mjs:53` calls `readJsonl(transcriptPath)` — the full session transcript, parsed line by line — on every Stop, then walks backward for the last traced message. Long sessions produce transcripts in the tens of MB; this is an O(session-length) cost paid per turn, in a hook whose design goal is "never blocks the agent."
- **Recommendation:** Read a bounded tail of the file (the last ~256KB is far more than any single response) before falling back to a full read. Keep the never-throw envelope.
- **Effort: S**
- **Expected impact:** Keeps the hook invisible on the long sessions where people actually work.

---

## 4. Code quality

The baseline is high: consistent style, dependency-free, comments that state constraints rather than narrate code (e.g. the backtracking note on `RULE_ID_RE`, `lib/rules.mjs:14-17`; the parseability-vs-empty distinction in `readImporterImports`, `lib/rules.mjs:190-193`). Findings that materially matter:

### Q1. `--lint-file` checks only the first trace block in a file

- **Severity: Low**
- **Why it matters:** Trace-lint mode (`validate-rules.mjs:53-75`) is the mode people will wire into PR checks, but `parseTraceBlock` finds the first "Rule trace" line and stops. A file containing several traces (a saved multi-turn transcript, a PR description with two task sections) gets only its first block checked; the rest pass silently.
- **Recommendation:** Either document "first block only" at the flag, or iterate all blocks — small, since the block-end scan already exists.
- **Effort: S**
- **Expected impact:** Removes a silent-pass edge in the one CI-facing lint mode.

### Q2. `expandGlob` limits are real but undocumented

- **Severity: Low**
- **Why it matters:** The hand-rolled glob (`lib/rules.mjs:49-81`) intentionally supports only `dir/*/sub/*.md` shapes — a good call for zero dependencies — but `**` is silently treated as a single-level `*`. A user writing `"apps/**/rules/*.md"` in `packageRuleGlobs` gets partial matches and no warning; their deeper rules simply don't exist to the validator, which then can't flag what it can't see.
- **Recommendation:** Detect `**` in a pattern and warn "recursive globs are not supported; list each level" (or adopt `fs.globSync` behind a version check now that modern Node has it, keeping the fallback).
- **Effort: XS**
- **Expected impact:** Converts the worst config failure (silently invisible rules) into a loud one.

### Q3. `defaultTranscriptDir` re-implements Claude Code's private path encoding

- **Severity: Low**
- **Why it matters:** `parse-traces.mjs:35-38` reproduces the `~/.claude/projects/<encoded-cwd>` hyphen-encoding. It's correct today, but it's an undocumented upstream detail that can change without notice; when it does, backfill silently finds zero transcripts (the "No transcript directory" message only fires if the whole directory is missing — a *changed* encoding yields an empty-but-existing miss).
- **Recommendation:** When the derived directory exists but yields zero transcript files, print the derived path and suggest `--transcripts`. One log line of defensive UX.
- **Effort: XS**
- **Expected impact:** Debuggability when (not if) the upstream layout shifts.

Not worth changing: the column-index coupling between `generate-catalog.mjs` and `loadCatalog` is already pinned by a dedicated regression test (`tests/rule-trace.test.mjs:441-467`) — that's the right treatment; leave it.

---

## 5. Documentation

### D1. Strong writing; the missing artifact is *visual*

- **Severity: High**
- **Why it matters:** The README is honest, well-structured, and answers the hard questions (limits, install-path conflicts, the "report before collect" trap). But the product's payoff is a dashboard, and there is no screenshot, no demo GIF, and no committed example of a migrated repo anywhere (eval outputs are git-ignored). A first-time visitor must run the full loop to see what they're buying. For a visual-output tool this is the single largest documentation gap.
- **Recommendation:** (a) Commit a screenshot of `dashboard.html` rendered over realistic data near the top of the README. (b) Add an `examples/` directory containing one small migrated repo end-state — rules, catalog, importers, a seeded `traces.jsonl`, and the generated `report.json` — so `node <skill>/scripts/report.mjs --root examples/demo` works out of the box. Dogfooding (P3) can double as this example.
- **Effort: S**
- **Expected impact:** The highest-ROI marketing change available; READMEs with output screenshots convert dramatically better for tooling projects.

### D2. New-user productivity is good; two questions remain unanswered

- **Severity: Medium**
- **Why it matters:** The install → migrate → validate path is well covered. Unanswered: (1) *"What does this cost per response and in context?"* (P4). (2) *"How do I know tracing is actually happening?"* — there is no verification step between "install" and "wait for the report" (P1's coverage metric is the systemic fix; a doc-level fix is immediate).
- **Recommendation:** Add a "Verify it's working" subsection to the Quickstart: ask the agent a rule-shaped question, then check that `.agents/metrics/traces.jsonl` gained a line. Sixty seconds that prevents weeks of silent no-op.
- **Effort: XS**
- **Expected impact:** Prevents the worst possible first-run experience.

### D3. No contributor-facing docs

- **Severity: Low**
- **Why it matters:** There is no CONTRIBUTING.md, no architecture note ("why two collectors, why append-only, why no deps"), and no release-process doc. The code comments carry much of this, but a contributor shouldn't have to reverse-engineer the invariants — the version lockstep across four files, for example, is enforced only by a test one discovers on failure (`tests/doc-integrity.test.mjs:69-87`).
- **Recommendation:** A one-page CONTRIBUTING.md: run tests, the no-dependencies rule, the version-lockstep rule, how evals differ from tests, how releases are cut.
- **Effort: S**
- **Expected impact:** Required for accepting outside PRs without friction; see §8.

---

## 6. Developer Experience

### X1. Not published to npm; no tags; no releases; no changelog

- **Severity: High**
- **Why it matters:** The repo is at v1.2.0 with a version-lockstep test, but there are zero git tags, zero GitHub releases, and no CHANGELOG. The documented CI path is `npx github:seanleecoder/rule-trace validate` (`README.md:139`, CI templates) — which is (a) unpinnable except by commit SHA, (b) slower (clones the repo per run), and (c) a trust smell in security-conscious orgs (executing HEAD of a personal repo in CI). The `package.json` `files` field and `bin` entry are already publication-ready.
- **Recommendation:** `npm publish` the package; tag releases (`v1.2.0`); add a CHANGELOG (the commit history is clean enough to reconstruct one). Update the CI snippets to a pinned `npx rule-trace@1 validate`.
- **Effort: S**
- **Expected impact:** Version pinning, provenance, and the credibility signal orgs need before wiring third-party code into CI. Cheapest high-impact item on the list alongside D1.

### X2. Local dev loop is good; CI is thinner than the support claim

- **Severity: Low**
- **Why it matters:** `npm test` is fast (~1.5s) and hermetic (the `CLAUDE_CONFIG_DIR` isolation in `tests/rule-trace.test.mjs:35-36` is a nice touch). But CI (`.github/workflows/ci.yml`) tests only Node 20 while `engines` claims `>=18`, and there's no lint/format check despite a consistent hand-maintained style.
- **Recommendation:** Matrix Node 18/20/22 (three cheap jobs); optionally add a formatter check to protect the style.
- **Effort: XS**
- **Expected impact:** Makes the `engines` claim continuously true.

### X3. The eval harness is a genuine strength — protect and publicize it

The eval design (validator-as-oracle, plan mode by default, `--exec` opt-in for spend, a baseline arm to show the delta, diagnostics for the known Codex sandbox failure at `evals/run.mjs:63-71`) is better than most companies' skill testing. Two small improvements: the with-skill vs. baseline **delta** is the project's best empirical claim and currently lives only in a README sentence (`evals/README.md:26`) — publish an actual result table; and `grade.mjs`'s hardcoded template fields are part of the A1 lockstep problem.

---

## 7. API & UX

### U1. Two overlapping vocabularies: agent modes vs CLI commands

- **Severity: Medium**
- **Why it matters:** SKILL.md defines four *modes* (init, migrate, audit, report); the CLI defines five *commands* (validate, parse, report, catalog, scaffold). They overlap on exactly one word (`report`), and the README's Core Workflow introduces a third list: "Migrate → Validate → **Collect** → Report" (`README.md:37-41`), where "Collect" means the CLI's `parse`. A new user holds three near-aligned word lists. The CLI help does bridge it (`cli.mjs:39-41` explains init/migrate are agent-driven) — the bridge just isn't consistent everywhere.
- **Recommendation:** Pick the workflow verbs as canonical and align: rename the CLI command `parse` → `collect` (keeping `parse` as an alias), and present one table in the README mapping mode → who runs it (agent vs. CLI) → command.
- **Effort: S**
- **Expected impact:** Removes the largest piece of gratuitous cognitive load in an otherwise clear interface.

### U2. Retiring a rule triggers a permanent validator warning

- **Severity: Medium**
- **Why it matters:** The convention is explicit: IDs are immutable; "to retire a rule, remove it from both its file and the catalog" (`references/rule-anatomy.md:36`). But the validator warns on numbering gaps (`validate-rules.mjs:177-193`) — so following the documented retirement procedure earns a warning on every validation run, forever. Users will either renumber (breaking the immutability the counters depend on) or learn to ignore warnings (eroding the validator's signal). The two rules contradict each other.
- **Recommendation:** Either drop the gap warning, or support a tombstone (a `## ROOT-004 (retired)` heading form, or a `retired: ["ROOT-004"]` config list) that fills the gap without a live rule.
- **Effort: XS** (drop) / **S** (tombstone)
- **Expected impact:** Resolves a genuine design contradiction before users hit it at scale.

### U3. Defaults are mostly excellent

`--root` defaulting to cwd, dry-run-by-default catalog generation (`--write` to persist), plan-by-default evals (`--exec` to spend), non-destructive scaffolding — the right defaults, notably consistent. One surprise to watch: bare `scaffold` writes a GitHub Actions workflow into the target repo (`scaffold-wiring.mjs:41-44` defaults `--all`, which includes `--ci github`). It's documented, but "I asked for wiring and got a CI workflow for a forge I don't use" is a plausible complaint; consider making CI opt-in at the next major.

---

## 8. Open source readiness

### O1. The gaps are all hygiene, not substance

- **Severity: Medium** (aggregate)
- **What's missing and why it matters:**
  - **Releases/versioning:** covered in X1 (no tags, no releases, no CHANGELOG, no npm). This is the blocker for org adoption.
  - **Contribution workflow:** no CONTRIBUTING.md, no issue/PR templates, no "good first issue" seeding. Fine at zero contributors; a wall at the first ten.
  - **Security:** no SECURITY.md — worth having because this project asks users to wire a hook that executes code on every agent turn. A one-paragraph trust-model statement ("the hook runs only the script you installed, reads the local transcript, writes one local file, never networks") plus a disclosure contact would preempt the obvious org-security question.
  - **Semantic guarantees:** nothing states what's stable. The trace-block convention, the event JSONL shape, the config keys, and the CLI flags are all de-facto public API. A "Stability" section declaring which follow semver would let people build on it.
  - **Discoverability:** good — skills.sh badge, sensible keywords, a background blog post. The dashboard screenshot (D1) is the missing conversion asset.
- **Recommendation:** One hygiene pass: publish + tag + CHANGELOG (X1), CONTRIBUTING.md (D3), SECURITY.md, a Stability section in the README, and basic issue templates.
- **Effort: S** (a day, total)
- **Expected impact:** Removes every checklist-item reason an org evaluator says no.

---

## 9. Competitive analysis

**Landscape.** No direct competitor does candidate-vs-applied tracing:

- **Cursor rules (`.cursor/rules/*.mdc`)** solve *attachment* deterministically (glob-scoped, `alwaysApply`) but say nothing about whether an attached rule shaped the output. rule-trace is complementary — and currently doesn't support the format (A2).
- **Rule-sync tools** (ruler-style projects) solve *distribution* — one canonical rule set fanned out to each tool's format. That overlaps only with rule-trace's importer layer; they have no IDs, no traces, no counters, no validator.
- **Agent observability platforms (LangSmith, Langfuse, Braintrust)** trace *execution* (spans, tool calls, tokens) but have no concept of a repo's standing rules, and they're services — rule-trace's local, dependency-free, files-in-repo model is a differentiated stance.
- **AGENTS.md / CLAUDE.md conventions themselves** are the substrate, not competitors — rule-trace is effectively proposing a schema layer on top of them.

**What it does better:** the candidate/applied diff, the Deviations waiver (converting silent non-compliance into a reviewable decision), CI-enforced catalog↔heading↔importer integrity, zero-dependency portability. **What it does worse:** setup weight vs. Cursor's two-line frontmatter; self-reported data vs. platforms' ground-truth execution traces; single-repo scope vs. platforms' org views. **What to emphasize:** it is the only tool that answers "which of my rules are dead weight" — that one-sentence positioning is stronger than the current feature-list framing. **Missed opportunity:** the with-skill vs. baseline eval delta, and especially a *compliance-delta* experiment (§12, M3), would be the only quantitative evidence in this space — nobody else can publish "rules with tracing get followed X% more."

---

## 10. Long-term vision

If this succeeds at thousands-of-users scale:

- **The prose trace format breaks first** (A1). At small scale you notice a parse miss; at scale, a model-version rollout silently zeroes thousands of repos' metrics for weeks. The structured emission + schema version must land *before* there's a large installed base emitting the old format.
- **`traces.jsonl` is fine per-repo, wrong per-org.** A single unbounded append-only file, no rotation, no aggregation across repos or teammates (each developer's hook writes locally, and the metrics dir is git-ignored by design, `templates/wiring/metrics.gitignore`). The per-repo design is right — but the moment a team wants shared counts, there is no story. Design the seam now (an `--export` emitting a mergeable, schema-versioned event file), not the service.
- **The importer-type enum becomes a treadmill** (A2). Every new agent tool means a code change to the hardcoded list in `readImporterImports`. The generated/inline importer approach ends the treadmill.
- **Skill-vs-package identity will strain.** Today the same repo is a skill (agent-driven modes), a plugin (hook), and a CLI (deterministic scripts), sharing one version. Fine now; at scale the deterministic core (lib + validator + report) wants to be an npm package the skill *depends on*, so CI consumers never take skill-prose changes as updates. Cheap to prepare: keep `lib/` strictly free of skill/doc coupling (it already is — preserve that).
- **Change now while small:** event schema versioning (XS), read-side dedup (XS), the structured trace format (M), the stability declaration (XS). Everything else can wait.

---

## 11. Hidden assumptions

### H1. `@`-imports in AGENTS.md are assumed to work for every AGENTS.md consumer

- **Severity: High**
- **Why it matters:** The lockstep-importer design treats `AGENTS.md` as an `at-import` file identical to `CLAUDE.md` (`lib/rules.mjs:31-32`, `references/importer-wiring.md:7-14`). But `@path` import syntax is a **Claude Code** feature; the AGENTS.md convention itself is plain markdown with no include directive. A Codex- or other AGENTS.md-reading tool most likely sees `@.agents/rules/root.md` as an inert line and **never loads the rules at all** — while the validator happily reports the importers "in lockstep." The system's central cross-tool claim ("keep multiple agent tools loading the same canonical rule files," `README.md:29`) may be false precisely for the tools the parity check was built for, and the failure is silent. Notably, `importer-wiring.md:32` shows awareness of adjacent semantics (the nested-import desync warning) without confronting this one.
- **Recommendation:** Test what each named tool actually does with an `@`-line, and document the result per tool. Where a tool doesn't follow references, offer the `generated` importer type (A2): materialize the rules inline into that tool's entry file from the canonical set, with the validator checking generated-content freshness instead of reference parity.
- **Effort: S** (verify + document) → **M** (generated importer)
- **Expected impact:** Either confirms the flagship claim or fixes it before adopters discover it in production.

### H2. Other implicit assumptions worth writing down

- **Severity: Low–Medium** (each XS to address)
- The **`.agents/` directory namespace** is assumed available in consuming repos — configurable, but never stated as an assumption.
- **Trace links** like `` [`ROOT-001`](rules/root.md) `` assume the response is rendered somewhere the relative path resolves (a PR view of the repo); pasted into chat or an issue elsewhere, every link 404s. Say so in `convention.md`.
- **The severity taxonomy is configurable, but the MUST-gap flag isn't.** `config.severities` can be customized (`lib/rules.mjs:26`), yet `report.mjs:96` hardcodes `'MUST'` — a repo customizing severities silently loses the report's headline flag.
- **The devil's-advocate question the docs should answer head-on:** *if counts are self-reported and unverifiable, why would they correlate with reality at all?* The implicit answer — the trace makes claims reviewable by humans, and claims that get reviewed stay honest — is a good one. Make it explicit; it's the first objection every skeptic raises, and burying it invites the "compliance theater" dismissal the README already anticipates (`README.md:31`).

---

## 12. Missing opportunities

Ranked by expected ROI; all additive, none urgent:

- **M1. PR-time trace lint as a packaged GitHub Action.** `--lint-file` already exists; wrapping it as an action that checks PR descriptions/comments for stale or hallucinated IDs (and posts the result) turns the convention into a visible, social artifact on every PR. *High ROI, effort M.*
- **M2. A `doctor` command.** One command running validate + coverage check (P1) + double-wire detection + "is the hook actually firing" smoke test. A single entry point for "why is my report empty." *High ROI, effort S.*
- **M3. The compliance-delta benchmark.** Extend the eval harness to measure whether agents follow rules *more* when the trace convention is loaded (with-trace vs. without-trace arms on tasks with rule-violating temptations). A positive result is the strongest possible marketing artifact and nobody else in this space can publish it; a null result is important product truth. The two-arm machinery already exists in `evals/run.mjs`. *Very high ROI, effort L.*
- **M4. A hosted demo dashboard** linked from the README (cheap once D1's example data exists). *Medium ROI, effort XS.*
- **M5. An org-export seam.** `report --export` emitting the schema-versioned mergeable event file from §10, enabling a later multi-repo aggregator without committing to build one. *Medium ROI now, high later; effort S.*

---

# Executive Summary

The ten highest-leverage improvements, ranked. (Impact and Effort scored 1–10; priority = do in this order.)

| # | Improvement | Impact | Effort | Priority | Why this should be done before everything else |
|---|-------------|--------|--------|----------|------------------------------------------------|
| 1 | **Trace-emission coverage metric** (P1) | 9 | 3 | P0 | Every existing metric is uninterpretable without a denominator. Until this lands, the dashboard cannot distinguish "dead rules" from "tracing silently stopped" — it is the load-bearing fix for the product's core promise. |
| 2 | **Dashboard screenshot + committed example** (D1) | 8 | 2 | P0 | Cheapest adoption lever in the repo. Nobody adopts a metrics tool whose output they've never seen; one image and one `examples/` dir change the README's conversion rate more than any feature. |
| 3 | **npm publish + tags + CHANGELOG** (X1) | 7 | 2 | P0 | `npx github:` at HEAD in CI is unpinnable and fails org security review. Publication is nearly free (package.json is ready) and unblocks every serious evaluator. |
| 4 | **Verify/fix the AGENTS.md `@`-import assumption** (H1) | 8 | 4 | P1 | The flagship cross-tool claim may be silently false for non-Claude tools. Must be verified before more adopters build on it; the fix (generated importers) also unlocks #7. |
| 5 | **Dogfood this repo** (P3) | 7 | 2 | P1 | Credibility + a permanent living example + the maintainer becomes user #1. Doubles as the example data for #2. |
| 6 | **Structured trace emission + event schema version** (A1) | 8 | 5 | P1 | The prose parser is the system's biggest long-term fragility, and the migration only gets more expensive as the installed base grows. The `"v":1` event field alone should ship immediately. |
| 7 | **Modern Cursor support (`.cursor/rules/*.mdc`)** (A2) | 7 | 5 | P2 | Cursor is named in the pitch but outside the parity check, and its current format is unmentioned. The largest single audience expansion available. |
| 8 | **Report correctness pass: read-side UUID dedup, staleness flag, `--since`** (A4, A5) | 6 | 3 | P2 | Small fixes that make the numbers trustworthy under documented usage (concurrent collectors) and deliver the README's "stale rules" promise. |
| 9 | **Unify the modes/commands vocabulary** (U1) | 5 | 2 | P2 | Three near-aligned word lists (modes, commands, workflow verbs) are the main gratuitous cognitive load; one rename plus one mapping table fixes it. |
| 10 | **Compliance-delta benchmark** (M3) | 8 | 6 | P3 | The only quantitative evidence anyone in this space could publish. High effort, but a positive result transforms the positioning from "plausible convention" to "measured intervention." |

---

## 1. Things I would definitely keep unchanged

- **The core conceptual model:** candidate vs. applied vs. deviations, with the diff as the headline signal and Deviations as a first-class waiver. This is the project's genuine invention — don't dilute it.
- **The honesty posture.** "Self-reported, not proof" is stated in the README, SKILL.md, the report script header, and rendered into the dashboard itself (`report.mjs:231`). That consistency is rare, and it is exactly why the project escapes the "compliance theater" dismissal.
- **Dependency-free, files-in-repo, local-only architecture.** No service, no lock-in, Node ≥18 and nothing else. A durable differentiator against platform competitors.
- **Append-only event log with aggregate-on-read** (`lib/metrics.mjs`) — raw data outliving parser improvements is the right call (finish it with read-side dedup, #8).
- **The non-destructive scaffolding and double-wire detection work** (`scaffold-wiring.mjs`, `lib/rules.mjs:294-378`). The care taken on the plugin-vs-manual-hook overlap — detected in scaffold *and* validator, documented in three places, covered by six tests — is exemplary edge-case engineering.
- **The eval harness design:** validator-as-oracle, plan-by-default/`--exec`-to-spend, a baseline arm for the delta, printed before/after paths, failure diagnostics.
- **Test quality:** hermetic (`CLAUDE_CONFIG_DIR` isolation), regression-labeled, with doc-integrity guards that catch "the docs reference a script that doesn't exist" — the exact failure class that kills agent-facing repos.
- **The reference-doc structure** (SKILL.md as a router, one focused reference per concern) — it matches how agents actually consume skills.

## 2. Biggest risks for the project over the next 2 years

1. **Silent decay of the data pipeline.** Model drift breaks prose-trace parsing, or context compaction stops emission, and — without the coverage metric — nobody notices until the dashboard has been meaningless for months. Risk #1 because it is *silent*; it compounds findings P1 and A1.
2. **The cross-tool promise quietly failing** (H1/A2). If non-Claude tools never actually load the rules, early multi-tool adopters discover it in production and the "tool-agnostic convention" positioning collapses. Verification is cheap; discovering it via a user's incident report is not.
3. **Platform absorption.** Claude Code, Cursor, or an AGENTS.md successor ships native rule-attachment metadata (Cursor already has half of it), commoditizing the ID/attachment layer. The defensible remainder is the *analysis* layer — counters, waivers, audit methodology — which is another reason to invest in the report/benchmark side (#8, #10) over the migration side.
4. **Bus factor of one.** Single maintainer, no CONTRIBUTING, no npm provenance, a personal marketplace. Any traction spike becomes an unserviceable issue queue; any pause reads as abandonment. The §8 hygiene pass is the mitigation.
5. **The convention tax being rejected.** If real-world use shows trace blocks annoy reviewers or degrade responses (the unanswered P4 question), adoption stalls regardless of tooling quality. The compliance-delta benchmark (M3) is the honest way to find out early — and this project's stated values suggest it would publish a null result, which is itself trust-building.

## 3. If this were my project: the next 30 days

**Week 1 — make the numbers trustworthy and the promise verifiable.**
Ship the coverage metric (P1) end-to-end: record untraced Stops, add the coverage stat and a low-coverage guard to the report and dashboard. Add `"v":1` to every new event, read-side UUID dedup, and the staleness flag (A4/A5). Add the "Verify it's working" smoke test to the Quickstart (D2). Test what Codex and one other AGENTS.md consumer actually do with an `@`-import line and write the result into `importer-wiring.md` (H1) — this one experiment decides Week 3's scope.

**Week 2 — make it adoptable.**
Dogfood the repo (P3): migrate this repo's own conventions, wire the validator into CI. Use the resulting data for a real `dashboard.html` screenshot in the README and a committed `examples/` end-state (D1). Publish to npm, tag v1.2.x, write the CHANGELOG retroactively, switch CI snippets to a pinned `npx rule-trace@1` (X1). Add the Cost paragraph and the two-tier value framing (P2/P4).

**Week 3 — close the architectural gaps while the installed base is small.**
Implement the fenced structured-trace emission with prose fallback (A1) plus the label-lockstep test. Then, depending on Week 1's H1 result: either document per-tool import semantics, or build the `generated` importer type — which also delivers `.cursor/rules` support (A2) as a second output format.

**Week 4 — hygiene and the flywheel.**
The §8 pass: CONTRIBUTING, SECURITY, a Stability section, issue templates. Unify the modes/commands vocabulary (U1, with `parse` → `collect` aliasing). Resolve the retirement-vs-gap-warning contradiction (U2). Then start the compliance-delta benchmark (M3) — not to finish it, but to run one pilot round, because its result should steer whether month two invests in the migration side or the analysis side of the product.

The through-line: **before growing the audience, make the metrics interpretable (coverage), the claims verified (importers), and the artifact visible (screenshot + example).** Everything else in this review compounds on those three.

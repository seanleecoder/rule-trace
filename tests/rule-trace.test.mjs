// Tests for the rule-trace skill's scripts and plugin manifests.
// Run from the repo root with `node --test tests/*.test.mjs` (or `npm test`).
//
// These verify the skill's own code (the shared parsing/scanning library and the
// validator CLI's pass/fail behavior on crafted fixtures) plus the plugin and
// marketplace manifests — everything that ships in this repo. Repo-content tests
// (e.g. "this project's rules validate") belong to the consuming project, not here.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  RULE_ID_RE,
  expandGlob,
  loadCatalog,
  loadConfig,
  parseAllTraceBlocks,
  parseTraceBlock,
} from '../skills/rule-trace/scripts/lib/rules.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const VALIDATOR = path.join(
  repoRoot,
  'skills/rule-trace/scripts/validate-rules.mjs',
)

// A guaranteed-empty Claude config dir so plugin-detection in scaffold/validate
// can't pick up the developer's real ~/.claude state. Tests that exercise
// detection write enabledPlugins into the fixture's own .claude/settings.json.
const EMPTY_CLAUDE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-noclaude-'))
const HERMETIC_ENV = { ...process.env, CLAUDE_CONFIG_DIR: EMPTY_CLAUDE_DIR }

function runValidator(root, extraArgs = [], env) {
  const res = spawnSync(
    process.execPath,
    [VALIDATOR, '--root', root, ...extraArgs],
    { encoding: 'utf8', env: env ? { ...HERMETIC_ENV, ...env } : HERMETIC_ENV },
  )
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') }
}

// --- ID regex ---
test('RULE_ID_RE matches layered IDs', () => {
  const ids = [
    ...'ROOT-001 GLOBAL-RC-012 PKG-EXPO-CODE-008 JOURNAL-4'.matchAll(
      RULE_ID_RE,
    ),
  ].map(m => m[1])
  assert.deepEqual(ids, [
    'ROOT-001',
    'GLOBAL-RC-012',
    'PKG-EXPO-CODE-008',
    'JOURNAL-4',
  ])
})

// --- trace-block parsing ---
test('parseTraceBlock extracts candidate/applied/deviations and ignores prose', () => {
  const text = [
    'Some answer text.',
    '',
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-002`](x), [`TEST-002`](y)',
    '- Rules applied: [`ROOT-002`](x)',
    '- Sources: whatever',
    '- Reasoning note: because',
    '- Deviations: [`TEST-002`](y) — not applied, no test path feasible',
  ].join('\n')
  const trace = parseTraceBlock(text)
  assert.deepEqual(trace.candidate, ['ROOT-002', 'TEST-002'])
  assert.deepEqual(trace.applied, ['ROOT-002'])
  assert.deepEqual(trace.deviations, ['TEST-002'])
})

test('parseTraceBlock handles a multiline (indented sub-bullet) trace block', () => {
  const text = [
    'Some answer text.',
    '',
    'Rule trace',
    '',
    '- Candidate rules loaded:',
    '  - [`ROOT-002`](x)',
    '  - [`TEST-002`](y)',
    '- Rules applied:',
    '  - [`ROOT-002`](x)',
    '- Deviations:',
    '  - [`TEST-002`](y) — not applied, no test path feasible',
  ].join('\n')
  const trace = parseTraceBlock(text)
  assert.deepEqual(trace.candidate, ['ROOT-002', 'TEST-002'])
  assert.deepEqual(trace.applied, ['ROOT-002'])
  assert.deepEqual(trace.deviations, ['TEST-002'])
})

test('parseTraceBlock returns null when there is no trace block', () => {
  assert.equal(parseTraceBlock('just a normal answer, no trace here'), null)
})

test('parseTraceBlock parses fenced-only JSON, dedupes, and drops invalid IDs', () => {
  const trace = parseTraceBlock([
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-001","ROOT-001","bad"],"applied":["TEST-002"]}',
    '```',
  ].join('\n'))
  assert.deepEqual(trace, { candidate: ['ROOT-001'], applied: ['TEST-002'], deviations: [] })
})

test('parseTraceBlock treats valid fenced JSON as authoritative over prose', () => {
  const text = [
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-999`](x)',
    '',
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-001"],"applied":[],"deviations":[]}',
    '```',
  ].join('\n')
  assert.deepEqual(parseTraceBlock(text).candidate, ['ROOT-001'])
})

test('parseTraceBlock falls back from malformed fenced JSON to prose', () => {
  const text = [
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-001`](x)',
    '',
    '```rule-trace',
    'not json',
    '```',
  ].join('\n')
  assert.deepEqual(parseTraceBlock(text).candidate, ['ROOT-001'])
})

test('parseTraceBlock uses the last fenced trace block', () => {
  const text = [
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-001"]}',
    '```',
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-002"]}',
    '```',
  ].join('\n')
  assert.deepEqual(parseTraceBlock(text).candidate, ['ROOT-002'])
})


test('parseAllTraceBlocks does not double-count a prose trace with fenced data', () => {
  const text = [
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-999`](x)',
    '- Rules applied: [`ROOT-999`](x)',
    '',
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-001"],"applied":["ROOT-001"],"deviations":[]}',
    '```',
  ].join('\n')
  const traces = parseAllTraceBlocks(text)
  assert.equal(traces.length, 1)
  assert.deepEqual(traces[0].candidate, ['ROOT-001'])
})

test('parseTraceBlock handles 4-backtick fences and rejects missing v', () => {
  const valid = [
    '````rule-trace',
    '{"v":1,"candidate":["ROOT-001"]}',
    '````',
  ].join('\n')
  assert.deepEqual(parseTraceBlock(valid).candidate, ['ROOT-001'])
  const missingVersion = [
    '```rule-trace',
    '{"candidate":["ROOT-001"]}',
    '```',
  ].join('\n')
  assert.equal(parseTraceBlock(missingVersion), null)
})

// --- fixture-based validator cases ---
function writeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fixture-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    [
      '# Rules',
      '',
      '## ROOT-001',
      '- Scope: repository',
      '- Applies when: always',
      '- Severity: MUST',
      '- Rule: do the thing',
      '',
      '## ROOT-002',
      '- Scope: repository',
      '- Applies when: sometimes',
      '- Severity: SHOULD',
      '- Rule: do the other thing',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    [
      '# Catalog',
      '',
      '| Rule ID | Source |',
      '| --- | --- |',
      '| `ROOT-001` | rules/root.md |',
      '| `ROOT-002` | rules/root.md |',
      '',
    ].join('\n'),
  )
  const imports = '@.agents/rules/root.md\n'
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), imports)
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), imports)
  return dir
}

test('clean fixture passes', () => {
  const dir = writeFixture()
  assert.equal(runValidator(dir).status, 0)
})

test('duplicate ID fails', () => {
  const dir = writeFixture()
  fs.appendFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    '\n## ROOT-001\n- Scope: repository\n- Applies when: dup\n- Severity: MAY\n- Rule: duplicate\n',
  )
  const { status, out } = runValidator(dir)
  assert.equal(status, 1)
  assert.match(out, /Duplicate rule ID ROOT-001/)
})

test('orphan heading (missing from catalog) fails', () => {
  const dir = writeFixture()
  fs.appendFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    '\n## ROOT-003\n- Scope: repository\n- Applies when: new\n- Severity: MAY\n- Rule: uncatalogued\n',
  )
  const { status, out } = runValidator(dir)
  assert.equal(status, 1)
  assert.match(out, /ROOT-003.*not listed in the catalog/)
})

test('importer drift fails', () => {
  const dir = writeFixture()
  fs.writeFileSync(
    path.join(dir, 'AGENTS.md'),
    '@.agents/rules/root.md\n@.agents/extra.md\n',
  )
  const { status, out } = runValidator(dir)
  assert.equal(status, 1)
  assert.match(out, /Importer drift/)
})

test('missing severity fails by default but passes with --no-severity', () => {
  const dir = writeFixture()
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    '# Rules\n\n## ROOT-001\n- Scope: repo\n- Applies when: always\n- Rule: do it\n\n## ROOT-002\n- Scope: repo\n- Applies when: sometimes\n- Rule: do it\n',
  )
  assert.equal(runValidator(dir).status, 1)
  assert.equal(runValidator(dir, ['--no-severity']).status, 0)
})

test('trace-lint flags an unknown cited ID in a second trace block', () => {
  const dir = writeFixture()
  const traceFile = path.join(dir, 'response.md')
  fs.writeFileSync(
    traceFile,
    'Rule trace\n\n- Candidate rules loaded: [`ROOT-001`](x)\n\n## Next\n\nRule trace\n\n- Candidate rules loaded: [`ROOT-999`](y)\n',
  )
  const { status, out } = runValidator(dir, ['--lint-file', traceFile])
  assert.equal(status, 1)
  assert.match(out, /ROOT-999/)
})


test('trace-lint treats retired IDs as unknown citations', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({ retiredIds: ['ROOT-003'] }))
  const traceFile = path.join(dir, 'response.md')
  fs.writeFileSync(traceFile, 'Rule trace\n\n- Candidate rules loaded: [`ROOT-003`](x)\n')
  const { status, out } = runValidator(dir, ['--lint-file', traceFile])
  assert.equal(status, 1)
  assert.match(out, /ROOT-003/)
})

// --- plugin + marketplace manifest sanity ---
test('plugin.json and marketplace.json carry required fields and point at a real skill', () => {
  const plugin = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.claude-plugin/plugin.json'), 'utf8'),
  )
  assert.ok(plugin.name, 'plugin.json needs a name')
  assert.ok(plugin.description, 'plugin.json needs a description')

  const market = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, '.claude-plugin/marketplace.json'),
      'utf8',
    ),
  )
  assert.ok(market.name, 'marketplace.json needs a name')
  assert.ok(market.owner?.name, 'marketplace.json needs an owner.name')
  assert.ok(
    Array.isArray(market.plugins) && market.plugins.length > 0,
    'marketplace.json needs a non-empty plugins array',
  )
  for (const p of market.plugins) {
    assert.ok(p.name, 'each marketplace plugin entry needs a name')
    assert.ok(p.source, 'each marketplace plugin entry needs a source')
  }

  assert.ok(
    fs.existsSync(path.join(repoRoot, 'skills/rule-trace/SKILL.md')),
    'the referenced skill SKILL.md must exist',
  )
})

// --- catalog generator ---
const GENERATE = path.join(
  repoRoot,
  'skills/rule-trace/scripts/generate-catalog.mjs',
)
const SCAFFOLD = path.join(
  repoRoot,
  'skills/rule-trace/scripts/scaffold-wiring.mjs',
)
const REPORT = path.join(
  repoRoot,
  'skills/rule-trace/scripts/report.mjs',
)
const PARSE = path.join(
  repoRoot,
  'skills/rule-trace/scripts/parse-traces.mjs',
)
const SYNC = path.join(
  repoRoot,
  'skills/rule-trace/scripts/sync-importers.mjs',
)

function runScript(script, args = []) {
  const res = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: HERMETIC_ENV,
  })
  return { status: res.status, out: (res.stdout || '') + (res.stderr || '') }
}

test('generate-catalog derives rows from headings and preserves existing summaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-gen-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    [
      '# Rules',
      '',
      '## ROOT-001',
      '- Scope: repository',
      '- Applies when: always',
      '- Severity: MUST',
      '- Rule: Pin the toolchain versions. This second sentence is dropped.',
      '',
      '## ROOT-002',
      '- Scope: tests',
      '- Applies when: writing tests',
      '- Severity: SHOULD',
      '- Rule: Prefer fixtures over mocks.',
      '',
    ].join('\n'),
  )
  // Partial catalog with a curated summary for ROOT-001 (ROOT-002 absent).
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    [
      '# Catalog',
      '',
      '## Catalog',
      '',
      '| Rule ID | Layer | Scope | Severity | Source | Summary |',
      '| --- | --- | --- | --- | --- | --- |',
      '| `ROOT-001` | root | repository | MUST | [x](rules/root.md) | CURATED ONE |',
      '',
    ].join('\n'),
  )

  assert.equal(runScript(GENERATE, ['--root', dir, '--write']).status, 0)
  const catalog = fs.readFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    'utf8',
  )
  // Curated summary preserved; new rule's summary derived (first sentence).
  assert.match(catalog, /ROOT-001.*CURATED ONE/)
  assert.match(catalog, /ROOT-002.*Prefer fixtures over mocks\./)
  assert.doesNotMatch(catalog, /This second sentence is dropped/)
  // The generated catalog must satisfy the validator.
  assert.equal(runValidator(dir).status, 0, 'generated catalog should validate')
})

// --- scaffold-wiring ---
test('scaffold-wiring writes the optional files when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  assert.equal(runScript(SCAFFOLD, ['--root', dir]).status, 0)
  for (const rel of [
    '.agents/metrics/.gitignore',
    '.github/workflows/rule-trace.yml',
    '.claude/settings.json',
  ]) {
    assert.ok(fs.existsSync(path.join(dir, rel)), `expected ${rel}`)
  }
})

test('scaffold-wiring never overwrites an existing settings.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const sentinel = '{"keep":"me"}'
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), sentinel)
  assert.equal(runScript(SCAFFOLD, ['--root', dir, '--hook']).status, 0)
  assert.equal(
    fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'),
    sentinel,
    'existing settings.json must be left untouched',
  )
  assert.ok(
    fs.existsSync(path.join(dir, '.claude', 'settings.rule-trace.json')),
    'a .example settings file should be written instead',
  )
})

// --- CLI dispatcher loads and lists every subcommand ---
// (Guards against syntax errors in cli.mjs that the script-level tests miss,
// since they invoke the scripts directly rather than through the dispatcher.)
test('cli.mjs loads and its help lists every subcommand', () => {
  const CLI = path.join(
    repoRoot,
    'skills/rule-trace/scripts/cli.mjs',
  )
  const { status, out } = runScript(CLI, ['--help'])
  assert.equal(status, 0, out)
  for (const cmd of ['validate', 'parse', 'report', 'catalog', 'scaffold', 'sync']) {
    assert.match(out, new RegExp(`\\b${cmd}\\b`), `help should list ${cmd}`)
  }
})

// --- scaffold selector scoping (regression: M1) ---
// A selective flag must scaffold ONLY that piece; CI must not leak in via the
// default. And a typo'd --ci must fail fast rather than produce partial output.
test('scaffold-wiring --hook alone does not write the CI workflow or gitignore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  assert.equal(runScript(SCAFFOLD, ['--root', dir, '--hook']).status, 0)
  assert.ok(
    fs.existsSync(path.join(dir, '.claude', 'settings.json')),
    'the hook settings should be written',
  )
  assert.ok(
    !fs.existsSync(path.join(dir, '.github', 'workflows', 'rule-trace.yml')),
    '--hook must not scaffold the CI workflow',
  )
  assert.ok(
    !fs.existsSync(path.join(dir, '.agents', 'metrics', '.gitignore')),
    '--hook must not scaffold the metrics .gitignore',
  )
})

test('scaffold-wiring rejects an unknown --ci value', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  const { status, out } = runScript(SCAFFOLD, ['--root', dir, '--ci', 'banana'])
  assert.equal(status, 1)
  assert.match(out, /banana/)
})

// --- malformed importer (regression: L4) ---
// A present-but-unparseable importer is a hard error, not a silent pass — so a
// broken opencode.json can't slip through CI.
test('validator errors on an unparseable opencode importer', () => {
  const dir = writeFixture()
  fs.mkdirSync(path.join(dir, '.opencode'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.opencode', 'opencode.json'), '{ not valid json ')
  const { status, out } = runValidator(dir)
  assert.equal(status, 1)
  assert.match(out, /opencode\.json/)
  assert.match(out, /could not be parsed|invalid JSON/i)
})

// --- dashboard coloring honors --low-rate (regression: L6) ---
test('report colors a sub-threshold row "low" under a custom --low-rate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-report-'))
  fs.mkdirSync(path.join(dir, '.agents', 'metrics'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    [
      '# Catalog',
      '',
      '| Rule ID | Source |',
      '| --- | --- |',
      '| `ROOT-001` | rules/root.md |',
      '',
    ].join('\n'),
  )
  // 5 candidate events, 3 applied → application rate 0.6 (between 0.5 and 0.7).
  const events = []
  for (let i = 0; i < 5; i++) {
    events.push(
      JSON.stringify({
        uuid: `u${i}`,
        candidate: ['ROOT-001'],
        applied: i < 3 ? ['ROOT-001'] : [],
        deviations: [],
      }),
    )
  }
  fs.writeFileSync(
    path.join(dir, '.agents', 'metrics', 'traces.jsonl'),
    events.join('\n') + '\n',
  )
  const outHtml = path.join(dir, 'dash.html')
  const { status, out } = runScript(REPORT, [
    '--root',
    dir,
    '--low-rate',
    '0.7',
    '--out-html',
    outHtml,
  ])
  assert.equal(status, 0, out)
  const html = fs.readFileSync(outHtml, 'utf8')
  // rate 0.6 < 0.7 → the row must carry the "low" class (it would be "ok" under
  // the old hardcoded 0.5 threshold).
  assert.match(html, /<tr class="low">/)
})

// --- loadCatalog source column (regression: L3) ---
// Drive the real generator so loadCatalog's column index is pinned to the
// generator's actual 6-column output (a reorder on either side would break this).
test('loadCatalog reads the Source column, not Severity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-l3-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    [
      '# Rules',
      '',
      '## ROOT-001',
      '- Scope: repository',
      '- Applies when: always',
      '- Severity: MUST',
      '- Rule: do the thing',
      '',
    ].join('\n'),
  )
  assert.equal(runScript(GENERATE, ['--root', dir, '--write']).status, 0)
  const rows = loadCatalog(dir, loadConfig(dir))
  const r = rows.find(x => x.id === 'ROOT-001')
  assert.ok(r, 'ROOT-001 row present')
  assert.match(r.source, /rules\/root\.md/, 'source must be the Source link')
  assert.notEqual(r.source, 'MUST', 'source must not be the Severity column')
  assert.equal(r.severity, 'MUST')
})

// --- expandGlob metacharacter escaping (regression: M2) ---
// A glob segment containing both `*` and `()` must treat the parens literally.
// deepEqual to a single path proves the fix neither under- nor over-matches.
test('expandGlob escapes regex metacharacters in a wildcard segment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-m2-'))
  fs.mkdirSync(path.join(dir, 'feat-nightly(beta)'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'feat-nightly(beta)', 'x.md'), 'rule')
  // Decoy without the literal "(beta)" suffix — must be excluded.
  fs.mkdirSync(path.join(dir, 'featrandom'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'featrandom', 'x.md'), 'rule')
  const matches = expandGlob(dir, 'feat*(beta)/x.md')
  assert.deepEqual(matches, [path.join('feat-nightly(beta)', 'x.md')])
})

// --- scaffold selector scoping, --gitignore side (regression: M1 symmetry) ---
test('scaffold-wiring --gitignore alone does not write the CI workflow or hook', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  assert.equal(runScript(SCAFFOLD, ['--root', dir, '--gitignore']).status, 0)
  assert.ok(
    fs.existsSync(path.join(dir, '.agents', 'metrics', '.gitignore')),
    'the metrics .gitignore should be written',
  )
  assert.ok(
    !fs.existsSync(path.join(dir, '.github', 'workflows', 'rule-trace.yml')),
    '--gitignore must not scaffold the CI workflow',
  )
  assert.ok(
    !fs.existsSync(path.join(dir, '.claude', 'settings.json')),
    '--gitignore must not scaffold the hook',
  )
})

// --- scaffold leaves an existing .example untouched (regression: L5) ---
test('scaffold-wiring does not overwrite an existing .example settings file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{"keep":"me"}')
  const exampleSentinel = '{"example":"keep"}'
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.rule-trace.json'),
    exampleSentinel,
  )
  assert.equal(runScript(SCAFFOLD, ['--root', dir, '--hook']).status, 0)
  assert.equal(
    fs.readFileSync(
      path.join(dir, '.claude', 'settings.rule-trace.json'),
      'utf8',
    ),
    exampleSentinel,
    'an existing .example settings file must be left untouched',
  )
})

// --- Stop-hook double-wiring detection ---
// The plugin auto-wires the Stop hook, so a manual one on top runs the recorder
// twice (silently, since record-trace.mjs dedupes by UUID). scaffold must not
// create that overlap; validate must surface it.

function writeEnabledPlugin(dir) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledPlugins: { 'rule-trace@seanleecoder-skills': true },
    }),
  )
}

const MANUAL_HOOK_SETTINGS = {
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node record-trace.mjs' }] }],
  },
}

test('scaffold-wiring --hook skips and warns when the plugin is enabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  writeEnabledPlugin(dir)
  const { status, out } = runScript(SCAFFOLD, ['--root', dir, '--hook'])
  assert.equal(status, 0)
  assert.match(out, /plugin is enabled/)
  assert.ok(
    !fs.existsSync(path.join(dir, '.claude', 'settings.rule-trace.json')),
    'must not drop a manual-hook example when the plugin already wires it',
  )
})

test('scaffold-wiring --hook leaves an existing record-trace hook untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scaffold-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const wired = JSON.stringify(MANUAL_HOOK_SETTINGS)
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), wired)
  const { status, out } = runScript(SCAFFOLD, ['--root', dir, '--hook'])
  assert.equal(status, 0)
  assert.match(out, /already wires the record-trace Stop hook/)
  assert.equal(
    fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'),
    wired,
    'existing settings must be untouched',
  )
  assert.ok(
    !fs.existsSync(path.join(dir, '.claude', 'settings.rule-trace.json')),
    'no redundant example when the hook is already wired',
  )
})

test('validator warns (but does not fail) on a double-wired Stop hook', () => {
  const dir = writeFixture()
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledPlugins: { 'rule-trace@seanleecoder-skills': true },
      ...MANUAL_HOOK_SETTINGS,
    }),
  )
  const { status, out } = runValidator(dir)
  assert.equal(status, 0, 'double-wiring is a warning, not an error')
  assert.match(out, /double-wired/)
})

test('validator does not warn when only the manual hook is present (no plugin)', () => {
  const dir = writeFixture()
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify(MANUAL_HOOK_SETTINGS),
  )
  const { status, out } = runValidator(dir)
  assert.equal(status, 0)
  assert.doesNotMatch(out, /double-wired/)
})

test('validator warns on a double-wire when the manual hook lives in USER settings', () => {
  const dir = writeFixture()
  // Plugin enabled in the project; the manual hook lives only in user settings —
  // the docs allow that, so the validator must still flag the double-wire.
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledPlugins: { 'rule-trace@seanleecoder-skills': true },
    }),
  )
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-home-'))
  fs.writeFileSync(
    path.join(userHome, 'settings.json'),
    JSON.stringify(MANUAL_HOOK_SETTINGS),
  )
  const { status, out } = runValidator(dir, [], { CLAUDE_CONFIG_DIR: userHome })
  assert.equal(status, 0, 'double-wiring is a warning, not an error')
  assert.match(out, /double-wired/)
})

function writeReportFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-report-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.agents', 'metrics'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    [
      '# Rules',
      '',
      '## ROOT-001',
      '- Scope: repository',
      '- Applies when: always',
      '- Severity: MUST',
      '- Rule: do the thing',
      '',
      '## ROOT-002',
      '- Scope: repository',
      '- Applies when: sometimes',
      '- Severity: SHOULD',
      '- Rule: do another thing',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    [
      '# Catalog',
      '',
      '| Rule ID | Source | Severity |',
      '| --- | --- | --- |',
      '| `ROOT-001` | rules/root.md | MUST |',
      '| `ROOT-002` | rules/root.md | SHOULD |',
      '',
    ].join('\n'),
  )
  return dir
}

function writeJsonl(file, records) {
  fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function runReport(dir, extraArgs = []) {
  const outJson = path.join(dir, 'report.json')
  const outHtml = path.join(dir, 'dashboard.html')
  const res = runScript(REPORT, [
    '--root',
    dir,
    '--out-json',
    outJson,
    '--out-html',
    outHtml,
    ...extraArgs,
  ])
  return { ...res, outJson, outHtml }
}

test('record-trace writes traced, untraced, and deduped live coverage events', () => {
  const dir = writeReportFixture()
  const transcript = path.join(dir, 'session.jsonl')
  writeJsonl(transcript, [
    {
      type: 'assistant',
      uuid: 'untraced-final',
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { content: [{ type: 'text', text: 'plain answer' }] },
    },
  ])
  const payload = JSON.stringify({ cwd: dir, transcript_path: transcript, hook_event_name: 'Stop' })
  let res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/record-trace.mjs')], {
    input: payload,
    encoding: 'utf8',
    env: HERMETIC_ENV,
  })
  assert.equal(res.status, 0)
  let events = fs.readFileSync(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(events.length, 1)
  assert.equal(events[0].traced, false)
  assert.equal(events[0].v, 1)

  res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/record-trace.mjs')], {
    input: payload,
    encoding: 'utf8',
    env: HERMETIC_ENV,
  })
  assert.equal(res.status, 0)
  events = fs.readFileSync(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(events.length, 1, 'same UUID should dedupe')

  writeJsonl(transcript, [
    {
      type: 'assistant',
      uuid: 'traced-final',
      sessionId: 's1',
      timestamp: '2026-01-02T00:00:00.000Z',
      message: { content: [{ type: 'text', text: 'Rule trace\n\n- Candidate rules loaded: [`ROOT-001`](x)\n- Rules applied: [`ROOT-001`](x)\n- Deviations: none' }] },
    },
  ])
  res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/record-trace.mjs')], {
    input: payload,
    encoding: 'utf8',
    env: HERMETIC_ENV,
  })
  assert.equal(res.status, 0)
  events = fs.readFileSync(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(events.length, 2)
  assert.equal(events[1].traced, true)
  assert.equal(events[1].v, 1)
  assert.deepEqual(events[1].candidate, ['ROOT-001'])
})


test('fenced traces flow through record-trace and parse-traces like prose traces', () => {
  const proseText = [
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-001`](x)',
    '- Rules applied: [`ROOT-001`](x)',
    '- Deviations: none',
  ].join('\n')
  const fencedText = [
    'Rule trace',
    '',
    '- Candidate rules loaded: [`ROOT-999`](x)',
    '- Rules applied: [`ROOT-999`](x)',
    '',
    '```rule-trace',
    '{"v":1,"candidate":["ROOT-001"],"applied":["ROOT-001"],"deviations":[]}',
    '```',
  ].join('\n')
  const comparable = event => ({
    traced: event.traced,
    candidate: event.candidate,
    applied: event.applied,
    deviations: event.deviations,
  })

  const hookDir = writeReportFixture()
  const hookTranscript = path.join(hookDir, 'hook.jsonl')
  const hookPayload = JSON.stringify({ cwd: hookDir, transcript_path: hookTranscript, hook_event_name: 'Stop' })
  for (const [uuid, text] of [['hook-prose', proseText], ['hook-fenced', fencedText]]) {
    writeJsonl(hookTranscript, [{
      type: 'assistant',
      uuid,
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { content: [{ type: 'text', text }] },
    }])
    const res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/record-trace.mjs')], {
      input: hookPayload,
      encoding: 'utf8',
      env: HERMETIC_ENV,
    })
    assert.equal(res.status, 0)
  }
  const hookEvents = fs.readFileSync(path.join(hookDir, '.agents', 'metrics', 'traces.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(comparable(hookEvents[1]), comparable(hookEvents[0]))

  const parseDir = writeReportFixture()
  const transcripts = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-transcripts-'))
  writeJsonl(path.join(transcripts, 'session.jsonl'), [
    {
      type: 'assistant',
      uuid: 'parse-prose',
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { content: [{ type: 'text', text: proseText }] },
    },
    {
      type: 'assistant',
      uuid: 'parse-fenced',
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:01.000Z',
      message: { content: [{ type: 'text', text: fencedText }] },
    },
  ])
  const out = path.join(parseDir, 'offline.jsonl')
  const parse = runScript(PARSE, ['--root', parseDir, '--transcripts', transcripts, '--out', out])
  assert.equal(parse.status, 0, parse.out)
  const parsedEvents = fs.readFileSync(out, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(parsedEvents.length, 2)
  assert.deepEqual(comparable(parsedEvents[1]), comparable(parsedEvents[0]))
})

test('report computes coverage, ignores untraced counts, and warns below threshold', () => {
  const dir = writeReportFixture()
  const events = []
  for (let i = 0; i < 6; i++) events.push({ uuid: `t${i}`, traced: true, candidate: ['ROOT-001'], applied: ['ROOT-001'], deviations: [], timestamp: '2026-01-01T00:00:00.000Z' })
  for (let i = 0; i < 4; i++) events.push({ uuid: `u${i}`, traced: false, timestamp: '2026-01-01T00:00:00.000Z' })
  writeJsonl(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), events)
  let res = runReport(dir)
  assert.equal(res.status, 0, res.out)
  let data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.deepEqual(data.coverage, { traced: 6, untraced: 4, rate: 0.6 })
  assert.equal(data.table.find(r => r.id === 'ROOT-001').candidate, 6)

  res = runReport(dir, ['--min-coverage', '0.7'])
  data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.equal(data.coverage.lowCoverage, true)
  assert.match(fs.readFileSync(res.outHtml, 'utf8'), /Low trace coverage/)
})

test('report dedupes, handles legacy coverage, staleness, and --since windows', () => {
  const dir = writeReportFixture()
  writeJsonl(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), [
    { uuid: 'dup', candidate: ['ROOT-001'], applied: ['ROOT-001'], deviations: [], timestamp: '2026-01-01T00:00:00.000Z' },
    { uuid: 'dup', candidate: ['ROOT-001'], applied: ['ROOT-001'], deviations: [], timestamp: '2026-01-01T00:00:00.000Z' },
    { uuid: 'old', traced: true, candidate: ['ROOT-002'], applied: [], deviations: [], timestamp: '2025-01-01T00:00:00.000Z' },
    { uuid: 'undated', traced: true, candidate: ['ROOT-002'], applied: [], deviations: [] },
  ])
  let res = runReport(dir, ['--stale-days', '30'])
  assert.equal(res.status, 0, res.out)
  let data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.equal(data.duplicateEventsIgnored, 1)
  assert.equal(data.coverage.rate, 1)
  assert.equal(data.table.find(r => r.id === 'ROOT-001').candidate, 1)
  assert.ok(data.flags.stale.some(x => x.id === 'ROOT-002'))

  res = runReport(dir, ['--stale-days', '900'])
  data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.ok(!data.flags.stale.some(x => x.id === 'ROOT-002'))

  res = runReport(dir, ['--since', '2025-12-31T00:00:00.000Z'])
  data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.equal(data.eventsOutsideWindowOrUndated, 2)
  assert.equal(data.table.find(r => r.id === 'ROOT-002').candidate, 0)
  assert.match(fs.readFileSync(res.outHtml, 'utf8'), /Stale/)
})

test('legacy-only report keeps coverage unknown and renders an em dash', () => {
  const dir = writeReportFixture()
  writeJsonl(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), [
    {
      uuid: 'legacy-1',
      candidate: ['ROOT-001'],
      applied: ['ROOT-001'],
      deviations: [],
    },
    {
      uuid: 'legacy-2',
      candidate: ['ROOT-001'],
      applied: [],
      deviations: ['ROOT-001'],
    },
  ])
  const res = runReport(dir)
  assert.equal(res.status, 0, res.out)
  const data = JSON.parse(fs.readFileSync(res.outJson, 'utf8'))
  assert.deepEqual(data.coverage, { traced: 0, untraced: 0, rate: null })
  assert.equal(data.table.find(r => r.id === 'ROOT-001').candidate, 2)
  assert.match(
    fs.readFileSync(res.outHtml, 'utf8'),
    /<b>—<\/b><span>0 of 0 responses traced<\/span>/,
  )
})

test('report rejects an invalid --since value', () => {
  const dir = writeReportFixture()
  writeJsonl(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), [])
  const res = runScript(REPORT, ['--root', dir, '--since', 'banana'])
  assert.equal(res.status, 1)
  assert.match(res.out, /banana/)
})


test('sync-importers creates deterministic cursor-mdc generated importers and validator checks freshness', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({
    packageRuleGlobs: [],
    importers: [
      { path: 'CLAUDE.md', type: 'at-import' },
      { path: 'AGENTS.md', type: 'at-import' },
      { path: '.cursor/rules/rule-trace.mdc', type: 'generated', flavor: 'cursor-mdc' },
    ],
  }))
  const first = runScript(SYNC, ['--root', dir])
  assert.equal(first.status, 0, first.out)
  assert.match(first.out, /created .*rule-trace\.mdc/)
  const generated = path.join(dir, '.cursor', 'rules', 'rule-trace.mdc')
  const bytes1 = fs.readFileSync(generated, 'utf8')
  assert.match(bytes1, /description:/)
  assert.match(bytes1, /alwaysApply: true/)
  assert.match(bytes1, /rule-trace:generated:begin/)
  assert.match(bytes1, /## ROOT-001/)
  const second = runScript(SYNC, ['--root', dir])
  assert.equal(second.status, 0, second.out)
  assert.match(second.out, /unchanged/)
  assert.equal(fs.readFileSync(generated, 'utf8'), bytes1)
  assert.equal(runValidator(dir).status, 0)
  fs.appendFileSync(path.join(dir, '.agents', 'rules', 'root.md'), '\n<!-- changed -->\n')
  const stale = runValidator(dir)
  assert.equal(stale.status, 1)
  assert.match(stale.out, /rule-trace\.mdc.*stale|stale.*rule-trace\.mdc/)
  const check = runScript(SYNC, ['--root', dir, '--check'])
  assert.equal(check.status, 1)
  assert.equal(fs.readFileSync(generated, 'utf8'), bytes1, '--check must not write')
  fs.writeFileSync(generated, `PREFACE\n${bytes1}\nTAIL\n`)
  assert.equal(runScript(SYNC, ['--root', dir]).status, 0)
  const withUserContent = fs.readFileSync(generated, 'utf8')
  assert.ok(withUserContent.startsWith('PREFACE\n'))
  assert.ok(withUserContent.endsWith('\nTAIL\n'))
  assert.equal(runScript(SYNC, ['--root', dir, '--check']).status, 0)
})


test('mixed config still fails reference importer drift while generated importer is fresh', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({
    packageRuleGlobs: [],
    importers: [
      { path: 'CLAUDE.md', type: 'at-import' },
      { path: 'AGENTS.md', type: 'at-import' },
      { path: '.cursor/rules/rule-trace.mdc', type: 'generated', flavor: 'cursor-mdc' },
    ],
  }))
  assert.equal(runScript(SYNC, ['--root', dir]).status, 0)
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '@.agents/rules/root.md\n@.agents/extra.md\n')
  const { status, out } = runValidator(dir)
  assert.equal(status, 1)
  assert.match(out, /Importer drift/)
  assert.doesNotMatch(out, /Generated importer .*stale/)
})

test('copilot-md generated importer renders markdown markers without frontmatter', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({
    packageRuleGlobs: [],
    importers: [
      { path: '.github/copilot-instructions.md', type: 'generated', flavor: 'copilot-md' },
    ],
  }))
  assert.equal(runScript(SYNC, ['--root', dir]).status, 0)
  const generated = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8')
  assert.ok(generated.startsWith('<!-- rule-trace:generated:begin'))
  assert.doesNotMatch(generated, /^---\n/)
  assert.match(generated, /## ROOT-001/)
})

test('validator and sync refuse to clobber existing generated files without markers', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({
    packageRuleGlobs: [],
    importers: [
      { path: '.cursor/rules/rule-trace.mdc', type: 'generated', flavor: 'cursor-mdc' },
    ],
  }))
  const generated = path.join(dir, '.cursor', 'rules', 'rule-trace.mdc')
  fs.mkdirSync(path.dirname(generated), { recursive: true })
  fs.writeFileSync(generated, 'user content without generated markers\n')
  const validation = runValidator(dir)
  assert.equal(validation.status, 1)
  assert.match(validation.out, /has no rule-trace generated markers/)
  assert.doesNotMatch(validation.out, /run rule-trace sync/)
  const res = runScript(SYNC, ['--root', dir])
  assert.equal(res.status, 1)
  assert.match(res.out, /has no rule-trace generated markers/)
  assert.doesNotMatch(res.out, /generated importers are stale/)
  assert.equal(fs.readFileSync(generated, 'utf8'), 'user content without generated markers\n')
})

test('CLI exposes collect and keeps parse alias', () => {
  const cli = path.join(repoRoot, 'skills/rule-trace/scripts/cli.mjs')
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /collect\s+Backfill/)
  assert.match(help.stdout, /alias: parse/)
  assert.doesNotMatch(help.stdout, /^  parse\s+/m)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-collect-'))
  const transcripts = path.join(dir, 'transcripts')
  fs.mkdirSync(transcripts)
  const collect = spawnSync(process.execPath, [cli, 'collect', '--root', dir, '--transcripts', transcripts], { encoding: 'utf8' })
  const parse = spawnSync(process.execPath, [cli, 'parse', '--root', dir, '--transcripts', transcripts], { encoding: 'utf8' })
  assert.equal(collect.status, 0)
  assert.equal(parse.status, 0)
})

function writeGapFixture(retired = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-gap-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.agents', 'rules', 'root.md'), [
    '## ROOT-001', '- Scope: repo', '- Applies when: always', '- Severity: MUST', '- Rule: one', '',
    '## ROOT-003', '- Scope: repo', '- Applies when: always', '- Severity: MUST', '- Rule: three', '',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, '.agents', 'rules-catalog.md'), [
    '| Rule ID | Layer | Scope | Severity | Source | Summary |', '| --- | --- | --- | --- | --- | --- |',
    '| `ROOT-001` | Root | repo | MUST | `.agents/rules/root.md` | one |',
    '| `ROOT-003` | Root | repo | MUST | `.agents/rules/root.md` | three |', '',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '@.agents/rules/root.md\n')
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '@.agents/rules/root.md\n')
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true })
  if (retired.length) fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({ retiredIds: retired }))
  return dir
}

test('retiredIds fill numbering gaps but cannot remain defined', () => {
  const noRetired = runValidator(writeGapFixture())
  assert.equal(noRetired.status, 0)
  assert.match(noRetired.out, /Numbering gap in ROOT-\*: 1 → 3/)
  const retired = runValidator(writeGapFixture(['ROOT-002']))
  assert.equal(retired.status, 0)
  assert.doesNotMatch(retired.out, /Numbering gap/)
  const stillDefined = writeGapFixture(['ROOT-002'])
  fs.appendFileSync(path.join(stillDefined, '.agents', 'rules', 'root.md'), '\n## ROOT-002\n- Scope: repo\n- Applies when: always\n- Severity: MUST\n- Rule: retired but live\n')
  const bad = runValidator(stillDefined)
  assert.equal(bad.status, 1)
  assert.match(bad.out, /ROOT-002 is in retiredIds but still defined/)
})

test('report treats retired IDs as retired rather than unknown', () => {
  const dir = writeGapFixture(['ROOT-002'])
  fs.mkdirSync(path.join(dir, '.agents', 'metrics'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.agents', 'metrics', 'traces.jsonl'), JSON.stringify({ uuid: '1', traced: true, candidate: ['ROOT-001', 'ROOT-002'], applied: ['ROOT-002'], deviations: [] }) + '\n')
  const outJson = path.join(dir, 'report.json')
  const res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/report.mjs'), '--root', dir, '--out-json', outJson, '--out-html', path.join(dir, 'report.html')], { encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  const data = JSON.parse(fs.readFileSync(outJson, 'utf8'))
  assert.deepEqual(data.flags.unknownIds, [])
  assert.deepEqual(data.flags.retired, [{ id: 'ROOT-002', candidate: 1, applied: 1 }])
})

test('config warns on unknown key and fails on wrong known-key type', () => {
  const typo = writeFixture()
  fs.writeFileSync(path.join(typo, '.agents', 'rule-trace.config.json'), JSON.stringify({ ruleDirs: '.agents/rules' }))
  const typoRes = runValidator(typo)
  assert.equal(typoRes.status, 0)
  assert.match(typoRes.out, /unknown key "ruleDirs"; did you mean "rulesDir"/)
  const wrong = writeFixture()
  fs.writeFileSync(path.join(wrong, '.agents', 'rule-trace.config.json'), JSON.stringify({ importers: 'CLAUDE.md' }))
  const wrongRes = runValidator(wrong)
  assert.equal(wrongRes.status, 1)
  assert.match(wrongRes.out, /importers must be an array/)
})

test('config warns when packageRuleGlobs uses unsupported recursive glob', () => {
  const dir = writeFixture()
  fs.writeFileSync(path.join(dir, '.agents', 'rule-trace.config.json'), JSON.stringify({ packageRuleGlobs: ['packages/**/rules/*.md'] }))
  const res = runValidator(dir)
  assert.equal(res.status, 0)
  assert.match(res.out, /unsupported recursive glob/)
  assert.match(res.out, /packages\/\*\*\/rules\/\*\.md/)
})

test('empty derived transcript directory prints explicit hint', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-empty-transcripts-root-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-home-'))
  const encoded = dir.replace(/[^a-zA-Z0-9]/g, '-')
  fs.mkdirSync(path.join(home, '.claude', 'projects', encoded), { recursive: true })
  const res = spawnSync(process.execPath, [path.join(repoRoot, 'skills/rule-trace/scripts/parse-traces.mjs'), '--root', dir], { encoding: 'utf8', env: { ...HERMETIC_ENV, HOME: home } })
  assert.equal(res.status, 0)
  assert.match(res.stderr, /No \.jsonl transcripts found in derived transcript directory/)
  assert.match(res.stderr, /--transcripts <dir>/)
})

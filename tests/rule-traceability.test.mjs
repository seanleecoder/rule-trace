// Tests for the rule-traceability skill's scripts and plugin manifests.
// Run from the repo root with `node --test tests/`.
//
// These verify the skill's own code (the shared parsing/scanning library and the
// validator CLI's pass/fail behavior on crafted fixtures) plus the plugin and
// marketplace manifests — everything that ships in this repo. Repo-content tests
// (e.g. "this project's rules validate") belong to the consuming project, not here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  RULE_ID_RE,
  parseTraceBlock,
} from '../skills/rule-traceability/scripts/lib/rules.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const VALIDATOR = path.join(
  repoRoot,
  'skills/rule-traceability/scripts/validate-rules.mjs',
)

function runValidator(root, extraArgs = []) {
  const res = spawnSync(
    process.execPath,
    [VALIDATOR, '--root', root, ...extraArgs],
    { encoding: 'utf8' },
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

test('parseTraceBlock returns null when there is no trace block', () => {
  assert.equal(parseTraceBlock('just a normal answer, no trace here'), null)
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

test('trace-lint flags an unknown cited ID', () => {
  const dir = writeFixture()
  const traceFile = path.join(dir, 'response.md')
  fs.writeFileSync(
    traceFile,
    'Rule trace\n\n- Candidate rules loaded: [`ROOT-001`](x), [`ROOT-999`](y)\n',
  )
  const { status, out } = runValidator(dir, ['--lint-file', traceFile])
  assert.equal(status, 1)
  assert.match(out, /ROOT-999/)
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
    fs.existsSync(path.join(repoRoot, 'skills/rule-traceability/SKILL.md')),
    'the referenced skill SKILL.md must exist',
  )
})

// --- catalog generator ---
const GENERATE = path.join(
  repoRoot,
  'skills/rule-traceability/scripts/generate-catalog.mjs',
)
const SCAFFOLD = path.join(
  repoRoot,
  'skills/rule-traceability/scripts/scaffold-wiring.mjs',
)

function runScript(script, args = []) {
  const res = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
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
    '.github/workflows/rule-traceability.yml',
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
    fs.existsSync(path.join(dir, '.claude', 'settings.rule-traceability.json')),
    'a .example settings file should be written instead',
  )
})

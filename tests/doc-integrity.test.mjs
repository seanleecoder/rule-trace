// Deterministic guards that need no LLM — they catch the class of bug where the
// docs tell the agent to run a script that's broken or doesn't exist (e.g. the
// cli.mjs backtick regression, or a doc referencing a renamed script). These run
// in CI alongside the behavioral unit tests.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const skillDir = path.join(repoRoot, 'skills', 'rule-trace')
const scriptsDir = path.join(skillDir, 'scripts')
// The pinned report-time "now" the committed examples/demo artifacts were
// generated with. Chosen so exactly one seeded rule (DEMO-ROOT-004) is stale at
// the default --stale-days; regenerate the demo with the same --now value.
const DEMO_NOW = '2026-07-10T00:00:00Z'

function walk(dir, pred) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(abs, pred))
    else if (pred(abs)) out.push(abs)
  }
  return out
}

test('every script parses (node --check)', () => {
  const scripts = walk(scriptsDir, f => f.endsWith('.mjs'))
  assert.ok(scripts.length >= 5, 'expected several scripts')
  for (const s of scripts) {
    const res = spawnSync(process.execPath, ['--check', s], { encoding: 'utf8' })
    assert.equal(res.status, 0, `syntax error in ${path.relative(repoRoot, s)}:\n${res.stderr}`)
  }
})

test('every scripts/*.mjs referenced in SKILL.md/references exists', () => {
  const docs = [
    path.join(skillDir, 'SKILL.md'),
    ...walk(path.join(skillDir, 'references'), f => f.endsWith('.md')),
  ]
  const re = /scripts\/((?:[\w-]+\/)*[\w-]+\.mjs)/g
  const missing = []
  for (const doc of docs) {
    const text = fs.readFileSync(doc, 'utf8')
    for (const m of text.matchAll(re)) {
      const rel = m[1]
      if (!fs.existsSync(path.join(scriptsDir, rel))) {
        missing.push(`${path.basename(doc)} → scripts/${rel}`)
      }
    }
  }
  assert.deepEqual(missing, [], `docs reference missing scripts:\n${missing.join('\n')}`)
})

test('every script the CLI dispatches to exists', () => {
  const cli = fs.readFileSync(path.join(scriptsDir, 'cli.mjs'), 'utf8')
  // string literals like 'validate-rules.mjs' in the COMMANDS map
  const targets = [...cli.matchAll(/'([\w-]+\.mjs)'/g)].map(m => m[1])
  assert.ok(targets.length >= 3, 'expected several CLI command targets')
  for (const t of targets) {
    assert.ok(
      fs.existsSync(path.join(scriptsDir, t)),
      `cli.mjs dispatches to scripts/${t} which does not exist`,
    )
  }
})

test('version agrees across package.json, plugin.json, metadata.json, and SKILL.md', () => {
  const ver = rel =>
    JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8')).version
  const pkg = ver('package.json')
  assert.ok(pkg, 'package.json needs a version')
  const fm = fs
    .readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    .match(/^version:\s*(.+)$/m)
  assert.ok(fm, 'SKILL.md frontmatter needs a version')
  assert.deepEqual(
    {
      plugin: ver('.claude-plugin/plugin.json'),
      metadata: ver('skills/rule-trace/metadata.json'),
      skill: fm[1].trim(),
    },
    { plugin: pkg, metadata: pkg, skill: pkg },
    'all version locations must match package.json',
  )
})

test('committed demo validates cleanly', () => {
  const res = spawnSync(
    process.execPath,
    [path.join(scriptsDir, 'validate-rules.mjs'), '--root', path.join(repoRoot, 'examples', 'demo')],
    { encoding: 'utf8' },
  )
  assert.equal(res.status, 0, `demo validation failed:\n${res.stdout}\n${res.stderr}`)
  assert.doesNotMatch(res.stdout, /⚠/, 'demo validation should have no warnings')
})

test('this repo\'s own dogfooded rules validate cleanly', () => {
  const res = spawnSync(
    process.execPath,
    [path.join(scriptsDir, 'validate-rules.mjs'), '--root', repoRoot],
    { encoding: 'utf8' },
  )
  assert.equal(res.status, 0, `root validation failed:\n${res.stdout}\n${res.stderr}`)
  assert.doesNotMatch(res.stdout, /⚠/, 'root validation should have no warnings')
})

test('committed demo report.json and dashboard.html match a fresh regeneration', () => {
  const demoRoot = path.join(repoRoot, 'examples', 'demo')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-demo-regen-'))
  const outJson = path.join(tmpDir, 'report.json')
  const outHtml = path.join(tmpDir, 'dashboard.html')
  const res = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'report.mjs'),
      '--root', demoRoot,
      '--out-json', outJson,
      '--out-html', outHtml,
      // Pinned so staleness (and generatedAt) never drift with wall-clock time;
      // must match the --now the committed demo artifacts were generated with
      // (see examples/demo/README.md).
      '--now', DEMO_NOW,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(res.status, 0, `demo report regeneration failed:\n${res.stdout}\n${res.stderr}`)

  assert.equal(
    fs.readFileSync(outJson, 'utf8'),
    fs.readFileSync(path.join(demoRoot, '.agents', 'metrics', 'report.json'), 'utf8'),
    'demo report.json drifted from a fresh regeneration',
  )
  assert.equal(
    fs.readFileSync(outHtml, 'utf8'),
    fs.readFileSync(path.join(demoRoot, '.agents', 'metrics', 'dashboard.html'), 'utf8'),
    'demo dashboard.html drifted from a fresh regeneration',
  )
})

// The demo README documents the same --now value in prose (for anyone
// regenerating by hand); catch drift between that literal and DEMO_NOW so the
// two can never silently disagree.
test('demo README --now literal matches the DEMO_NOW test constant', () => {
  const demoReadme = fs.readFileSync(
    path.join(repoRoot, 'examples', 'demo', 'README.md'),
    'utf8',
  )
  const m = demoReadme.match(/--now\s+(\S+)/)
  assert.ok(m, 'demo README should document a --now value')
  assert.equal(m[1], DEMO_NOW, 'demo README --now literal drifted from DEMO_NOW')
})

test('README embeds the dashboard screenshot', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
  assert.match(readme, /docs\/dashboard\.png/)
  assert.equal(fs.existsSync(path.join(repoRoot, 'docs', 'dashboard.png')), true)
})


test('trace labels and fenced tag stay in lockstep across parser, docs, template, and grader', () => {
  const rels = [
    'skills/rule-trace/scripts/lib/rules.mjs',
    'skills/rule-trace/references/convention.md',
    'skills/rule-trace/templates/rule-trace.md.tmpl',
    '.agents/rule-trace.md',
    'evals/grade.mjs',
  ]
  for (const rel of rels) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
    for (const token of ['Candidate rules loaded', 'Rules applied', 'Deviations', 'rule-trace']) {
      assert.ok(text.includes(token), `${rel} must include ${token}`)
    }
  }
})


test('CLI help documents collect as the primary backfill command', () => {
  const res = spawnSync(process.execPath, [path.join(scriptsDir, 'cli.mjs'), '--help'], { encoding: 'utf8' })
  assert.equal(res.status, 0)
  assert.match(res.stdout, /collect\s+Backfill/)
  assert.match(res.stdout, /alias: parse/)
})

test('CLI help documents the report --now flag', () => {
  const res = spawnSync(process.execPath, [path.join(scriptsDir, 'cli.mjs'), '--help'], { encoding: 'utf8' })
  assert.equal(res.status, 0)
  assert.match(res.stdout, /--now <ISO-8601 date>/)
})

test('OSS hygiene docs exist and link the package issue tracker', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'CONTRIBUTING.md')), true)
  assert.equal(fs.existsSync(path.join(repoRoot, 'SECURITY.md')), true)
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const contributing = fs.readFileSync(path.join(repoRoot, 'CONTRIBUTING.md'), 'utf8')
  assert.match(contributing, new RegExp(pkg.bugs.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const GRADE = path.join(repoRoot, 'evals/grade.mjs')

function writeMigratedFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-grade-'))
  fs.mkdirSync(path.join(dir, '.agents', 'rules'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules', 'root.md'),
    [
      '# Repository rules',
      '',
      '## ROOT-001',
      '',
      '- Scope: repository',
      '- Applies when: installing dependencies',
      '- Severity: MUST',
      '- Rule: Use pnpm, not npm.',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, '.agents', 'rules-catalog.md'),
    [
      '# Rule Trace Catalog',
      '',
      '| Rule ID | Layer | Scope | Severity | Source | Summary |',
      '| --- | --- | --- | --- | --- | --- |',
      '| `ROOT-001` | root | repository | MUST | [`.agents/rules/root.md`](rules/root.md) | Use pnpm, not npm. |',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '@.agents/rules/root.md\n')
  return dir
}

function grade(root) {
  const res = spawnSync(process.execPath, [GRADE, '--root', root, '--json'], {
    encoding: 'utf8',
  })
  assert.equal(res.status, 0)
  return JSON.parse(res.stdout)
}

test('grade requires the rule-trace convention to include trace template fields', () => {
  const dir = writeMigratedFixture()

  let result = grade(dir)
  assert.equal(result.validatorPass, true)
  assert.equal(result.ruleCount, 1)
  assert.equal(result.catalogExists, true)
  assert.equal(result.conventionExists, false)
  assert.equal(result.conventionHasTraceTemplate, false)
  assert.equal(result.score, 0)

  fs.writeFileSync(
    path.join(dir, '.agents', 'rule-trace.md'),
    '# Rule tracing convention\n\nThis file is intentionally incomplete.\n',
  )
  result = grade(dir)
  assert.equal(result.conventionExists, true)
  assert.equal(result.conventionHasTraceTemplate, false)
  assert.equal(result.score, 0)

  fs.writeFileSync(
    path.join(dir, '.agents', 'rule-trace.md'),
    [
      '# Rule tracing convention',
      '',
      'Rule trace',
      '',
      '- Candidate rules loaded: ...',
      '- Rules applied: ...',
      '- Sources: ...',
      '- Reasoning note: ...',
      '- Deviations: ...',
      '',
      '```rule-trace',
      '{"v":1,"candidate":[],"applied":[],"deviations":[]}',
      '```',
      '',
    ].join('\n'),
  )
  result = grade(dir)
  assert.equal(result.conventionHasTraceTemplate, true)
  assert.equal(result.score, 1)
})

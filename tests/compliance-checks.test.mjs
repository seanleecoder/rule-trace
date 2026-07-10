import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const fixturesRoot = path.join(repoRoot, 'evals', 'compliance', 'fixtures')
const runner = path.join(repoRoot, 'evals', 'compliance', 'run.mjs')

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compliance-')) }

test('compliance checks distinguish compliant and violating trees', async () => {
  for (const fixture of fs.readdirSync(fixturesRoot)) {
    const checksPath = path.join(fixturesRoot, fixture, 'checks.mjs')
    if (!fs.existsSync(checksPath)) continue
    const checks = (await import(checksPath)).default
    const good = tmp()
    const bad = tmp()
    if (fixture === 'deps-and-scripts') {
      fs.mkdirSync(path.join(good, 'docs'), { recursive: true }); fs.writeFileSync(path.join(good, 'docs', 'scripts.md'), 'lint')
      fs.mkdirSync(path.join(bad, 'docs'), { recursive: true }); fs.writeFileSync(path.join(bad, 'package-lock.json'), '{}'); fs.writeFileSync(path.join(bad, 'docs', 'scripts.md'), 'test')
    } else if (fixture === 'layering') {
      fs.mkdirSync(path.join(good, 'src', 'components'), { recursive: true }); fs.writeFileSync(path.join(good, 'src', 'components', 'User.js'), 'import x from "../repositories/users"')
      fs.mkdirSync(path.join(bad, 'src', 'components'), { recursive: true }); fs.writeFileSync(path.join(bad, 'src', 'components', 'User.js'), 'const db = require("../db/client")')
    } else if (fixture === 'tests-required') {
      fs.mkdirSync(path.join(good, 'src'), { recursive: true }); fs.mkdirSync(path.join(good, 'tests'), { recursive: true }); fs.writeFileSync(path.join(good, 'src', 'math.js'), ''); fs.writeFileSync(path.join(good, 'tests', 'math.test.js'), 'math')
      fs.mkdirSync(path.join(bad, 'src'), { recursive: true }); fs.writeFileSync(path.join(bad, 'src', 'math.js'), '')
    } else if (fixture === 'secrets-hygiene') {
      fs.mkdirSync(path.join(good, 'src'), { recursive: true }); fs.writeFileSync(path.join(good, 'src', 'config.js'), 'process.env.API')
      fs.mkdirSync(path.join(bad, 'src'), { recursive: true }); fs.writeFileSync(path.join(bad, 'src', 'api.js'), 'process.env.API')
    }
    for (const check of checks) {
      assert.equal(check.check(good), true, `${fixture} ${check.ruleId} good`)
      assert.equal(check.check(bad), false, `${fixture} ${check.ruleId} bad`)
    }
  }
})

test('compliance runner plans all arms and keeps task prompts identical', () => {
  const workspace = tmp()
  const res = spawnSync(process.execPath, [runner, '--trials', '1', '--workspace', workspace], { encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /deps-and-scripts · prose · 1/)
  assert.match(res.stdout, /ids-only\s+planned/)
  assert.match(res.stdout, /=== compliance by fixture ===/)
  assert.match(res.stdout, /tests-required\s+traced\s+planned/)
  for (const fixture of fs.readdirSync(fixturesRoot).filter(f => fs.existsSync(path.join(fixturesRoot, f, 'task.txt')))) {
    const tasks = ['prose', 'traced', 'ids-only'].map(arm => fs.readFileSync(path.join(workspace, fixture, arm, '1', 'TASK.txt'), 'utf8'))
    assert.equal(new Set(tasks).size, 1, `${fixture} task prompt differs by arm`)
  }
})


test('layering check catches all common db client import forms', async () => {
  const checks = (await import(path.join(fixturesRoot, 'layering', 'checks.mjs'))).default
  const check = checks.find(c => c.ruleId === 'LAYER-001')
  const importForms = [
    'import db from "../db/client"',
    'import "../db/client"',
    'const db = require("../db/client")',
    'const db = await import("../db/client")',
  ]
  for (const source of importForms) {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'components', 'User.js'), source)
    assert.equal(check.check(dir), false, source)
  }
})

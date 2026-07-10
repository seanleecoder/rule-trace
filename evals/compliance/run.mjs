#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { AGENTS, agentInvocation, copyDir, renderComplianceReport, runAgent } from '../lib.mjs'
import { parseTraceBlock } from '../../skills/rule-trace/scripts/lib/rules.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const fixturesRoot = path.join(here, 'fixtures')
const arms = ['prose', 'traced', 'ids-only']

function parseArgs(argv) {
  const args = { exec: false, trials: 3, fixtures: null, agent: process.env.RULE_TRACE_EVAL_AGENT || 'claude', model: null, codexSandbox: 'workspace-write', workspace: path.join(repoRoot, '.eval-workspace', 'compliance'), report: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--exec') args.exec = true
    else if (a === '--trials') args.trials = Number(argv[++i])
    else if (a === '--fixtures') args.fixtures = argv[++i].split(',').map(s => s.trim())
    else if (a === '--agent') args.agent = argv[++i]
    else if (a === '--model') args.model = argv[++i]
    else if (a === '--codex-sandbox') args.codexSandbox = argv[++i]
    else if (a === '--workspace') args.workspace = path.resolve(argv[++i])
    else if (a === '--report') args.report = path.resolve(argv[++i])
  }
  if (!AGENTS.has(args.agent)) throw new Error(`unknown --agent ${args.agent}`)
  return args
}

function writeArm(fixture, arm, dest) {
  copyDir(path.join(fixturesRoot, fixture, 'base'), dest)
  const rules = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture, 'rules.json'), 'utf8'))
  const prose = rules.map(r => `- ${r.text}`).join('\n') + '\n'
  if (arm === 'prose') fs.writeFileSync(path.join(dest, 'CLAUDE.md'), prose)
  else {
    fs.mkdirSync(path.join(dest, '.agents', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(dest, '.agents', 'rules', 'root.md'), rules.map(r => `## ${r.id}\n\n- Scope: fixture\n- Applies when: ${r.text}\n- Severity: MUST\n- Rule: ${r.text}\n`).join('\n'))
    fs.writeFileSync(path.join(dest, '.agents', 'rules-catalog.md'), ['| Rule ID | Layer | Scope | Severity | Source | Summary |', '| --- | --- | --- | --- | --- | --- |', ...rules.map(r => `| \`${r.id}\` | Fixture | fixture | MUST | .agents/rules/root.md | ${r.text} |`)].join('\n'))
    if (arm === 'traced') fs.writeFileSync(path.join(dest, '.agents', 'rule-trace.md'), 'Emit Rule trace blocks that cite candidate, applied, and deviations.\n')
    fs.writeFileSync(path.join(dest, 'CLAUDE.md'), '@.agents/rules/root.md\n' + (arm === 'traced' ? '@.agents/rule-trace.md\n' : ''))
  }
  const task = fs.readFileSync(path.join(fixturesRoot, fixture, 'task.txt'), 'utf8').trim()
  fs.writeFileSync(path.join(dest, 'TASK.txt'), task + '\n')
  return task
}

async function grade(fixture, dir) {
  const mod = await import(path.join(fixturesRoot, fixture, 'checks.mjs'))
  return mod.default.map(c => ({ ruleId: c.ruleId, description: c.description, pass: Boolean(c.check(dir)) }))
}

const args = parseArgs(process.argv.slice(2))
const fixtures = fs.readdirSync(fixturesRoot).filter(f => fs.existsSync(path.join(fixturesRoot, f, 'checks.mjs')) && (!args.fixtures || args.fixtures.includes(f)))
const records = []
for (const fixture of fixtures) {
  for (const arm of arms) {
    for (let trial = 1; trial <= args.trials; trial++) {
      const dir = path.join(args.workspace, fixture, arm, String(trial))
      const task = writeArm(fixture, arm, dir)
      const prompt = `${task}\n\nWork in ${dir}.`
      console.log(`\n[${fixture} · ${arm} · ${trial}]`)
      const inv = agentInvocation({ agent: args.agent, prompt, cwd: dir, model: args.model, codexSandbox: args.codexSandbox, repoRoot })
      const run = runAgent(inv, args.exec)
      const checks = args.exec ? await grade(fixture, dir) : []
      const trace = parseTraceBlock(`${run.stdout}\n${run.stderr}`)
      records.push({ fixture, arm, trial, dir, checks, traceEmitted: Boolean(trace), traceCandidate: trace?.candidate || [], traceDeviations: trace?.deviations || [] })
    }
  }
}
function summarize(rows, keys) {
  const groups = new Map()
  for (const record of rows) {
    const key = keys.map(k => record[k]).join('\0')
    if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(keys.map(k => [k, record[k]])), passed: 0, total: 0, rate: 0 })
    const group = groups.get(key)
    for (const check of record.checks) {
      group.total++
      if (check.pass) group.passed++
    }
  }
  return [...groups.values()].map(row => ({ ...row, rate: row.total ? row.passed / row.total : 0 }))
}

const byArm = arms.map(arm => summarize(records.filter(r => r.arm === arm), ['arm'])[0] || { arm, passed: 0, total: 0, rate: 0 })
const byFixtureArm = summarize(records, ['fixture', 'arm']).sort((a, b) => a.fixture.localeCompare(b.fixture) || a.arm.localeCompare(b.arm))
const violationsB = records.filter(r => r.arm === 'traced').flatMap(r => r.checks.filter(c => !c.pass).map(c => ({ record: r, check: c })))
const disclosed = violationsB.filter(v => v.record.traceDeviations.includes(v.check.ruleId)).length
const citedViolationRules = violationsB.filter(v => v.record.traceCandidate.includes(v.check.ruleId)).length
const data = { generatedAt: new Date().toISOString(), trials: args.trials, records, summary: { byArm, byFixtureArm, violationsInTracedArm: violationsB.length, disclosedViolations: disclosed, citedViolationRules } }
if (args.exec) {
  const out = path.join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(data, null, 2))
  console.log(`\nwrote ${out}`)
}
console.log('\n=== compliance by arm ===')
for (const row of byArm) console.log(`${row.arm.padEnd(9)} ${row.total ? Math.round(row.rate * 100) + '%' : 'planned'} (${row.passed}/${row.total})`)
console.log('\n=== compliance by fixture ===')
for (const row of byFixtureArm) console.log(`${row.fixture.padEnd(16)} ${row.arm.padEnd(9)} ${row.total ? Math.round(row.rate * 100) + '%' : 'planned'} (${row.passed}/${row.total})`)
if (args.report) fs.writeFileSync(args.report, renderComplianceReport(data))

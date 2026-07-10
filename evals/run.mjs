#!/usr/bin/env node
// Repeatable eval-round runner. Sets up an isolated copy of each fixture, (optionally)
// drives an agent CLI to perform the skill's `migrate` mode on it, then grades the
// result with grade.mjs (the validator is the oracle) and prints a summary table.
//
// Safe by default: WITHOUT --exec it only sets up the copies, writes the prompt for
// each, prints the exact command to run, and grades whatever is already there. Pass
// --exec to actually invoke an agent CLI. Claude is the default for backward
// compatibility; pass `--agent codex` to drive `codex exec` instead.
//
// Usage:
//   node evals/run.mjs                       # plan: set up + print commands + grade existing (no agent run)
//   node evals/run.mjs --exec                # full round: with-skill on every fixture
//   node evals/run.mjs --exec --agent codex  # full round using Codex instead of Claude
//   node evals/run.mjs --exec --agent codex --codex-sandbox danger-full-access
//   node evals/run.mjs --exec --fixtures single-claude-md,oss   # smaller round
//   node evals/run.mjs --exec --baseline     # also run the no-skill arm (shows the delta)
//   node evals/run.mjs --grade-only          # just re-grade the current workspace
// (Deterministic guards are separate and need no agent: `npm test`.)

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { AGENTS, agentInvocation as buildAgentInvocation, runAgent as runAgentInvocation, setupFixture } from './lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const SKILL = path.join(repoRoot, 'skills/rule-trace/SKILL.md')
const VALIDATOR = path.join(repoRoot, 'skills/rule-trace/scripts/validate-rules.mjs')
const GRADE = path.join(here, 'grade.mjs')
const fixturesRoot = path.join(here, 'fixtures')

function parseArgs(argv) {
  const a = {
    exec: false,
    baseline: false,
    gradeOnly: false,
    fixtures: null,
    model: null,
    agent: process.env.RULE_TRACE_EVAL_AGENT || process.env.EVAL_AGENT || 'claude',
    codexSandbox: process.env.RULE_TRACE_CODEX_SANDBOX || 'workspace-write',
    workspace: path.join(repoRoot, '.eval-workspace'),
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exec') a.exec = true
    else if (argv[i] === '--baseline') a.baseline = true
    else if (argv[i] === '--grade-only') a.gradeOnly = true
    else if (argv[i] === '--fixtures') a.fixtures = argv[++i].split(',').map(s => s.trim())
    else if (argv[i] === '--model') a.model = argv[++i]
    else if (argv[i] === '--agent') a.agent = argv[++i]
    else if (argv[i] === '--codex-sandbox') a.codexSandbox = argv[++i]
    else if (argv[i] === '--workspace') a.workspace = path.resolve(argv[++i])
  }
  if (!AGENTS.has(a.agent)) throw new Error(`unknown --agent ${a.agent}; expected one of: ${[...AGENTS].join(', ')}`)
  return a
}

const args = parseArgs(process.argv.slice(2))
const evalsDef = JSON.parse(fs.readFileSync(path.join(here, 'evals.json'), 'utf8'))
const selected = evalsDef.evals.filter(e => !args.fixtures || args.fixtures.includes(e.fixture))

if (args.exec && args.agent === 'codex' && args.codexSandbox === 'workspace-write') {
  console.log(
    [
      '! Codex workspace-write may block creating the required .agents/ output path.',
      '  If an arm fails with EPERM or produces no .agents/ directory, rerun this throwaway eval with:',
      '  --codex-sandbox danger-full-access',
    ].join('\n'),
  )
}

function fixtureSource(fixture) {
  return path.join(here, 'fixtures', fixture)
}

function withSkillPrompt(dir) {
  return [
    `Read the rule-trace skill at ${SKILL} and the references it points to`,
    `(especially references/migration-guide.md and references/rule-anatomy.md), then perform`,
    `its **migrate** mode on the repo at ${dir} — work entirely within that directory.`,
    `Split the existing prose rules into discrete rules with layered stable IDs and the rule`,
    `anatomy (Scope / Applies when / Severity / Rule); create .agents/rules/*.md, a synced`,
    `.agents/rules-catalog.md (you may run the skill's generate-catalog.mjs) and .agents/rule-trace.md;`,
    `rewire the entry points as thin importers. Do NOT invent rules. Make this pass:`,
    `node ${VALIDATOR} --root ${dir}`,
  ].join(' ')
}

function baselinePrompt(dir) {
  return [
    `Convert the prose agent rules in the repo at ${dir} into a traceable, ID-based format:`,
    `give each rule a stable ID under a .agents/rules/ directory, build a .agents/rules-catalog.md`,
    `index of every ID, and rewire the entry points as thin importers. Work entirely within ${dir}.`,
  ].join(' ')
}

function setup(fixture, armDir) {
  setupFixture({ fixturesRoot, fixture, dest: armDir })
}

function runAgent(prompt, cwd) {
  const invocation = buildAgentInvocation({
    agent: args.agent,
    prompt,
    cwd,
    model: args.model,
    codexSandbox: args.codexSandbox,
    repoRoot,
  })
  const display = invocation.display.replace('<prompt>', '<migrate prompt>')
  const displayCwd = args.agent === 'claude' ? path.relative(repoRoot, cwd) : invocation.cwd
  const result = runAgentInvocation({ ...invocation, display }, args.exec, { displayCwd, stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.error) console.log(`  ! could not run ${args.agent}: ${result.error}`)
  else if (result.status !== null && result.status !== 0) console.log(`  ! ${args.agent} exited with status ${result.status}`)
}

function grade(dir) {
  const res = spawnSync(process.execPath, [GRADE, '--root', dir, '--json'], { encoding: 'utf8' })
  try {
    return JSON.parse(res.stdout)
  } catch {
    return { score: 0, validatorPass: false, ruleCount: 0 }
  }
}

function diagnose(row) {
  const notes = []
  if (!fs.existsSync(row.dir)) {
    notes.push(`output directory missing: ${row.dir}`)
    return notes
  }

  const agentsDir = path.join(row.dir, '.agents')
  const hasAgents = fs.existsSync(agentsDir)
  if (row.score === 0 && !hasAgents) {
    notes.push('no .agents/ output was produced')
    if (args.agent === 'codex' && args.codexSandbox === 'workspace-write') {
      notes.push('Codex workspace-write commonly blocks .agents/ here; retry with --codex-sandbox danger-full-access')
    }
  } else if (row.score === 0 && hasAgents && row.ruleCount === 0) {
    notes.push(
      'created .agents/ output, but the validator found no rule-trace rule anatomy: expected ## ID headings with "- Scope:", "- Applies when:", "- Severity:", and "- Rule:" fields',
    )
  }
  if (row.score === 0 && row.conventionExists && !row.conventionHasTraceTemplate) {
    notes.push('created .agents/rule-trace.md, but it is missing the expected Rule trace template fields')
  } else if (row.score === 0 && !row.conventionExists && hasAgents) {
    notes.push('missing .agents/rule-trace.md convention file')
  }
  return notes
}

const rows = []
for (const ev of selected) {
  const arms = [{ arm: 'with-skill', dir: path.join(args.workspace, 'with', ev.fixture), prompt: withSkillPrompt }]
  if (args.baseline) arms.push({ arm: 'baseline', dir: path.join(args.workspace, 'base', ev.fixture), prompt: baselinePrompt })
  for (const { arm, dir, prompt } of arms) {
    console.log(`\n[${ev.fixture} · ${arm}]`)
    if (!args.gradeOnly) {
      setup(ev.fixture, dir)
      runAgent(prompt(dir), dir)
    }
    const g = fs.existsSync(dir) ? grade(dir) : { score: 0, ruleCount: 0, validatorPass: false }
    rows.push({ fixture: ev.fixture, arm, dir, source: fixtureSource(ev.fixture), ...g })
  }
}

console.log('\n=== summary ===')
console.log('fixture                arm         score  rules  validator')
for (const r of rows) {
  console.log(
    `${r.fixture.padEnd(22)} ${r.arm.padEnd(11)} ${String(r.score).padEnd(6)} ${String(r.ruleCount).padEnd(6)} ${r.validatorPass ? 'pass' : 'FAIL'}`,
  )
}

console.log('\n=== outputs ===')
for (const fixture of [...new Set(rows.map(r => r.fixture))]) {
  const source = fixtureSource(fixture)
  console.log(`${fixture}`)
  console.log(`  before: ${source}`)
  for (const r of rows.filter(row => row.fixture === fixture)) {
    console.log(`  after (${r.arm}): ${r.dir}`)
  }
}

const diagnostics = args.exec || args.gradeOnly
  ? rows.flatMap(r => diagnose(r).map(note => ({ row: r, note })))
  : []
if (diagnostics.length) {
  console.log('\n=== diagnostics ===')
  for (const { row, note } of diagnostics) {
    console.log(`${row.fixture} · ${row.arm}: ${note}`)
  }
}

if (!args.exec && !args.gradeOnly) {
  console.log(`\n(plan only — no agent was run. Re-run with --exec to drive \`${args.agent}\`, add --agent codex to use Codex, or run the printed command yourself, then \`node evals/run.mjs --grade-only\`.)`)
}

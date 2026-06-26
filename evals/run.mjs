#!/usr/bin/env node
// Repeatable eval-round runner. Sets up an isolated copy of each fixture, (optionally)
// drives an agent CLI to perform the skill's `migrate` mode on it, then grades the
// result with grade.mjs (the validator is the oracle) and prints a summary table.
//
// Safe by default: WITHOUT --exec it only sets up the copies, writes the prompt for
// each, prints the exact command to run, and grades whatever is already there. Pass
// --exec to actually invoke the agent CLI (`claude -p`, needs a permissive mode).
//
// Usage:
//   node evals/run.mjs                       # plan: set up + print commands + grade existing (no agent run)
//   node evals/run.mjs --exec                # full round: with-skill on every fixture
//   node evals/run.mjs --exec --fixtures single-claude-md,oss   # smaller round
//   node evals/run.mjs --exec --baseline     # also run the no-skill arm (shows the delta)
//   node evals/run.mjs --grade-only          # just re-grade the current workspace
// (Deterministic guards are separate and need no agent: `npm test`.)

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const SKILL = path.join(repoRoot, 'skills/rule-traceability/SKILL.md')
const VALIDATOR = path.join(repoRoot, 'skills/rule-traceability/scripts/validate-rules.mjs')
const GRADE = path.join(here, 'grade.mjs')

function parseArgs(argv) {
  const a = { exec: false, baseline: false, gradeOnly: false, fixtures: null, model: null, workspace: path.join(repoRoot, '.eval-workspace') }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exec') a.exec = true
    else if (argv[i] === '--baseline') a.baseline = true
    else if (argv[i] === '--grade-only') a.gradeOnly = true
    else if (argv[i] === '--fixtures') a.fixtures = argv[++i].split(',').map(s => s.trim())
    else if (argv[i] === '--model') a.model = argv[++i]
    else if (argv[i] === '--workspace') a.workspace = path.resolve(argv[++i])
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
const evalsDef = JSON.parse(fs.readFileSync(path.join(here, 'evals.json'), 'utf8'))
const selected = evalsDef.evals.filter(e => !args.fixtures || args.fixtures.includes(e.fixture))

function withSkillPrompt(dir) {
  return [
    `Read the rule-traceability skill at ${SKILL} and the references it points to`,
    `(especially references/migration-guide.md and references/rule-anatomy.md), then perform`,
    `its **migrate** mode on the repo at ${dir} — work entirely within that directory.`,
    `Split the existing prose rules into discrete rules with layered stable IDs and the rule`,
    `anatomy (Scope / Applies when / Severity / Rule); create .agents/rules/*.md, a synced`,
    `.agents/rules-catalog.md (you may run the skill's generate-catalog.mjs) and .agents/traceability.md;`,
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

// Copy a fixture into the workspace (oss = just its rule files; others = whole dir).
function setup(fixture, armDir) {
  fs.rmSync(armDir, { recursive: true, force: true })
  fs.mkdirSync(armDir, { recursive: true })
  const src = path.join(here, 'fixtures', fixture)
  if (fixture === 'oss') {
    if (!fs.existsSync(src)) throw new Error(`oss fixture missing — run: node evals/fetch-oss.mjs --repo <owner/project>`)
    for (const m of ['CLAUDE.md', 'AGENTS.md', '.cursorrules']) {
      if (fs.existsSync(path.join(src, m))) fs.copyFileSync(path.join(src, m), path.join(armDir, m))
    }
  } else {
    fs.cpSync(src, armDir, { recursive: true })
  }
}

function runAgent(prompt, cwd) {
  const cmd = ['-p', prompt, '--permission-mode', 'bypassPermissions', ...(args.model ? ['--model', args.model] : [])]
  console.log(`  $ claude -p "<migrate prompt>" --permission-mode bypassPermissions${args.model ? ` --model ${args.model}` : ''}  (cwd: ${path.relative(repoRoot, cwd)})`)
  if (!args.exec) return
  const res = spawnSync('claude', cmd, { cwd, stdio: 'inherit' })
  if (res.error) console.log(`  ! could not run claude: ${res.error.message}`)
}

function grade(dir) {
  const res = spawnSync(process.execPath, [GRADE, '--root', dir, '--json'], { encoding: 'utf8' })
  try {
    return JSON.parse(res.stdout)
  } catch {
    return { score: 0, validatorPass: false, ruleCount: 0 }
  }
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
    rows.push({ fixture: ev.fixture, arm, ...g })
  }
}

console.log('\n=== summary ===')
console.log('fixture                arm         score  rules  validator')
for (const r of rows) {
  console.log(
    `${r.fixture.padEnd(22)} ${r.arm.padEnd(11)} ${String(r.score).padEnd(6)} ${String(r.ruleCount).padEnd(6)} ${r.validatorPass ? 'pass' : 'FAIL'}`,
  )
}
if (!args.exec && !args.gradeOnly) {
  console.log('\n(plan only — no agent was run. Re-run with --exec to drive `claude -p`, or run the printed command yourself, then `node evals/run.mjs --grade-only`.)')
}

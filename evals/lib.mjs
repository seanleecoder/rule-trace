import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const AGENTS = new Set(['claude', 'codex'])

export function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

export function setupFixture({ fixturesRoot, fixture, dest }) {
  const src = path.join(fixturesRoot, fixture)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  if (fixture === 'oss') {
    if (!fs.existsSync(src)) throw new Error(`oss fixture missing — run: node evals/fetch-oss.mjs --repo <owner/project>`)
    for (const m of ['CLAUDE.md', 'AGENTS.md', '.cursorrules']) {
      if (fs.existsSync(path.join(src, m))) fs.copyFileSync(path.join(src, m), path.join(dest, m))
    }
  } else {
    fs.cpSync(src, dest, { recursive: true })
  }
}

export function agentInvocation({ agent, prompt, cwd, model, codexSandbox = 'workspace-write', repoRoot }) {
  if (agent === 'claude') {
    return { bin: 'claude', cmd: ['-p', prompt, '--permission-mode', 'bypassPermissions', ...(model ? ['--model', model] : [])], display: `claude -p "<prompt>" --permission-mode bypassPermissions${model ? ` --model ${model}` : ''}`, cwd }
  }
  return { bin: 'codex', cmd: ['--cd', cwd, '--sandbox', codexSandbox, '--ask-for-approval', 'never', ...(model ? ['--model', model] : []), 'exec', '--skip-git-repo-check', '--ephemeral', '--color', 'never', prompt], display: `codex --cd ${cwd} --sandbox ${codexSandbox} --ask-for-approval never${model ? ` --model ${model}` : ''} exec --skip-git-repo-check --ephemeral "<prompt>"`, cwd: repoRoot }
}

export function runAgent(invocation, execute, spawnOptions = {}) {
  const displayCwd = spawnOptions.displayCwd || invocation.cwd
  const { displayCwd: _displayCwd, ...options } = spawnOptions
  console.log(`  $ ${invocation.display}  (cwd: ${displayCwd})`)
  if (!execute) return { status: null, error: null, stdout: '', stderr: '' }
  const res = spawnSync(invocation.bin, invocation.cmd, { cwd: invocation.cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...options })
  return { status: res.status, error: res.error?.message || null, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function renderComplianceReport(data) {
  const lines = ['# Compliance benchmark pilot', '', `Trials: ${data.trials}`, '', '> Small-n pilot results are directional, not statistically conclusive.', '', '| Arm | Compliance |', '| --- | ---: |']
  for (const row of data.summary.byArm) lines.push(`| ${row.arm} | ${Math.round(row.rate * 100)}% (${row.passed}/${row.total}) |`)
  lines.push('', '## Compliance by fixture', '', '| Fixture | Arm | Compliance |', '| --- | --- | ---: |')
  for (const row of data.summary.byFixtureArm || []) lines.push(`| ${row.fixture} | ${row.arm} | ${Math.round(row.rate * 100)}% (${row.passed}/${row.total}) |`)
  lines.push('', '## Trace disclosure', '')
  lines.push(`Traced-arm violations disclosed as deviations: ${data.summary.disclosedViolations} / ${data.summary.violationsInTracedArm} violation(s).`)
  lines.push(`Traced-arm violations that cited the violated rule in candidates: ${data.summary.citedViolationRules} / ${data.summary.violationsInTracedArm} violation(s).`)
  return lines.join('\n') + '\n'
}

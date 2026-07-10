import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const AGENTS = new Set(['claude', 'codex'])

export function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

export function agentInvocation({ agent, prompt, cwd, model, codexSandbox = 'workspace-write', repoRoot }) {
  if (agent === 'claude') {
    return { bin: 'claude', cmd: ['-p', prompt, '--permission-mode', 'bypassPermissions', ...(model ? ['--model', model] : [])], display: `claude -p "<prompt>" --permission-mode bypassPermissions${model ? ` --model ${model}` : ''}`, cwd }
  }
  return { bin: 'codex', cmd: ['--cd', cwd, '--sandbox', codexSandbox, '--ask-for-approval', 'never', ...(model ? ['--model', model] : []), 'exec', '--skip-git-repo-check', '--ephemeral', '--color', 'never', prompt], display: `codex --cd ${cwd} --sandbox ${codexSandbox} --ask-for-approval never${model ? ` --model ${model}` : ''} exec --skip-git-repo-check --ephemeral "<prompt>"`, cwd: repoRoot }
}

export function runAgent(invocation, execute) {
  console.log(`  $ ${invocation.display}  (cwd: ${invocation.cwd})`)
  if (!execute) return { status: null }
  const res = spawnSync(invocation.bin, invocation.cmd, { cwd: invocation.cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  return { status: res.status, error: res.error?.message || null, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function renderComplianceReport(data) {
  const lines = ['# Compliance benchmark pilot', '', `Trials: ${data.trials}`, '', '> Small-n pilot results are directional, not statistically conclusive.', '', '| Arm | Compliance |', '| --- | ---: |']
  for (const row of data.summary.byArm) lines.push(`| ${row.arm} | ${Math.round(row.rate * 100)}% (${row.passed}/${row.total}) |`)
  lines.push('', '## Disclosed vs silent violations', '')
  lines.push(`Arm B disclosed deviations: ${data.summary.disclosedViolations} / ${data.summary.violationsInTracedArm} violation(s).`)
  return lines.join('\n') + '\n'
}

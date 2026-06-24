#!/usr/bin/env node
// Thin CLI dispatcher so the deterministic tooling is runnable without a coding
// agent — e.g. in CI via `npx github:ilovepku/rule-traceability validate`.
// Delegates to the sibling scripts; no logic lives here.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const COMMANDS = {
  validate: 'validate-rules.mjs',
  parse: 'parse-traces.mjs',
  report: 'report.mjs',
}

const HELP = `rule-traceability <command> [options]

Commands:
  validate   Validate the rule system: every catalog ID resolves to a heading,
             every heading is catalogued, no duplicate IDs, importers agree, and
             required fields (incl. Severity) are present.
             Flags: --root <dir>  --no-severity  --lint-file <path>  --json
  parse      Backfill rule-trace events from saved transcripts into the event log.
             Flags: --root <dir>  --transcripts <dir>  --out <file>
  report     Aggregate the event log into report.json + a dashboard.html.
             Flags: --root <dir>  --out-json <file>  --out-html <file>

  init and migrate are agent-driven modes — open this skill (SKILL.md) in your
  coding agent and ask it to "init" rule traceability in a fresh repo or
  "migrate" an existing repo's rules into the traceable format.

All commands default --root to the current directory.`

const [cmd, ...rest] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(HELP)
  process.exit(cmd ? 0 : 1)
}

const script = COMMANDS[cmd]
if (!script) {
  console.error(`Unknown command: ${cmd}\n\n${HELP}`)
  process.exit(1)
}

const res = spawnSync(process.execPath, [path.join(here, script), ...rest], {
  stdio: 'inherit',
})
process.exit(res.status ?? 1)

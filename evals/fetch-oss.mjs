#!/usr/bin/env node
// Fetch a real public repo (one with substantial agent-rule files — a CLAUDE.md,
// AGENTS.md, or .cursorrules) to use as a "real project" migrate fixture. The
// clone lands in the git-ignored evals/fixtures/oss/ — we don't vendor third-party
// code into this repo.
//
// Usage: node evals/fetch-oss.mjs --repo <git-url-or-owner/repo> [--dest <dir>]
// Example: node evals/fetch-oss.mjs --repo https://github.com/owner/project

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = { repo: null, dest: path.join(here, 'fixtures', 'oss') }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') args.repo = argv[++i]
    else if (argv[i] === '--dest') args.dest = path.resolve(argv[++i])
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.repo) {
  console.error('Pass --repo <git-url-or-owner/repo>. Pick a public repo with a CLAUDE.md / AGENTS.md / .cursorrules.')
  process.exit(1)
}
const url = args.repo.startsWith('http') || args.repo.includes('@') ? args.repo : `https://github.com/${args.repo}`

fs.rmSync(args.dest, { recursive: true, force: true })
fs.mkdirSync(path.dirname(args.dest), { recursive: true })
const res = spawnSync('git', ['clone', '--depth', '1', url, args.dest], { stdio: 'inherit' })
if (res.status !== 0) process.exit(res.status ?? 1)

const markers = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.github/copilot-instructions.md']
const found = markers.filter(m => fs.existsSync(path.join(args.dest, m)))
console.log(`\nCloned ${url} → ${path.relative(process.cwd(), args.dest)}`)
console.log(found.length ? `Agent-rule files found: ${found.join(', ')}` : '⚠ no obvious agent-rule files at the repo root — pick another repo or point migrate at the right docs.')

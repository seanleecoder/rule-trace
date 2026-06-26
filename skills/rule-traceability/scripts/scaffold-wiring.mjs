#!/usr/bin/env node
// Scaffold the optional operational wiring into a target repo.
//
// The skill itself works on install; this writes the *optional* glue a project
// may want: a metrics .gitignore, a CI job that runs the validator, and the
// Claude Code Stop hook for the live counter. It is non-destructive — it never
// overwrites an existing file; when one is present it writes a `.example` (or a
// separate include file) and prints instructions instead.
//
// Usage:
//   node scaffold-wiring.mjs [--root <dir>] [--ci github|gitlab|none]
//                            [--hook] [--gitignore] [--all]
// With no selector flags, --all is assumed.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES = path.join(here, '..', 'templates', 'wiring')

const VALID_CI = ['github', 'gitlab', 'none']

function parseArgs(argv) {
  // ci starts null so it's only defaulted to 'github' in the no-selector / --all
  // path. A selective run (--hook, --gitignore) must NOT also scaffold CI.
  const args = { root: process.cwd(), ci: null, hook: false, gitignore: false, all: false, selected: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') args.root = path.resolve(argv[++i])
    else if (a === '--ci') { args.ci = argv[++i]; args.selected = true }
    else if (a === '--hook') { args.hook = true; args.selected = true }
    else if (a === '--gitignore') { args.gitignore = true; args.selected = true }
    else if (a === '--all') { args.all = true; args.selected = true }
  }
  if (!args.selected || args.all) {
    args.hook = true
    args.gitignore = true
    if (args.ci === null) args.ci = 'github'
  }
  // Fail fast on a typo'd selector rather than silently producing partial output.
  if (args.ci !== null && !VALID_CI.includes(args.ci)) {
    console.error(
      `Unknown --ci value: ${args.ci === undefined ? '(missing)' : args.ci}. Expected one of: ${VALID_CI.join(', ')}.`,
    )
    process.exit(1)
  }
  return args
}

const tpl = name => fs.readFileSync(path.join(TEMPLATES, name), 'utf8')

const created = []
const skipped = []
const notes = []

// Write only if absent; otherwise record a skip (caller may emit a fallback).
function writeIfAbsent(rel, content, root) {
  const abs = path.join(root, rel)
  if (fs.existsSync(abs)) {
    skipped.push(rel)
    return false
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  created.push(rel)
  return true
}

const args = parseArgs(process.argv.slice(2))

if (args.gitignore) {
  writeIfAbsent('.agents/metrics/.gitignore', tpl('metrics.gitignore'), args.root)
}

if (args.ci === 'github') {
  writeIfAbsent('.github/workflows/rule-traceability.yml', tpl('github-actions.yml'), args.root)
} else if (args.ci === 'gitlab') {
  const rel = '.gitlab/rule-traceability.gitlab-ci.yml'
  if (writeIfAbsent(rel, tpl('gitlab-ci.yml'), args.root)) {
    notes.push(`Add to your .gitlab-ci.yml:  include: { local: '${rel}' }`)
  }
}

if (args.hook) {
  const settingsRel = '.claude/settings.json'
  const settingsAbs = path.join(args.root, settingsRel)
  if (!fs.existsSync(settingsAbs)) {
    writeIfAbsent(settingsRel, tpl('stop-hook.settings.json'), args.root)
  } else {
    // Non-destructive: leave the existing settings untouched, drop an example.
    const exampleRel = '.claude/settings.rule-traceability.json'
    writeIfAbsent(exampleRel, tpl('stop-hook.settings.json'), args.root)
    notes.push(
      `${settingsRel} already exists — merge the "hooks".Stop entry from ${exampleRel} into it (the live counter won't run until you do).`,
    )
  }
}

console.log('Scaffolded rule-traceability wiring:')
for (const c of created) console.log(`  + ${c}`)
for (const s of skipped) console.log(`  · ${s} (exists, left untouched)`)
for (const n of notes) console.log(`  ! ${n}`)
if (!created.length) console.log('  (nothing to do)')

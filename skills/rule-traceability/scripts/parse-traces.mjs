#!/usr/bin/env node
// Offline transcript parser — retroactive backfill of rule-trace events.
//
// Walks saved Claude Code session transcripts, extracts every "Rule trace" block
// from main-agent (non-sidechain) assistant messages, and appends them as events
// to the metrics log. Safe to re-run: dedupe is by message UUID. This is the
// tool-agnostic collector — point `--transcripts` at any directory of JSONL
// transcripts whose records expose `uuid` + an assistant `message.content`.
//
// Usage:
//   node parse-traces.mjs [--root <dir>] [--transcripts <dir>] [--out <file>]
// Defaults: transcripts dir derived from the project's Claude Code path;
// output is <root>/<metricsDir>/traces.jsonl.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { loadConfig, readJsonl } from './lib/rules.mjs'
import { tracesPath, eventFromAssistant, appendEvents } from './lib/metrics.mjs'

function parseArgs(argv) {
  const args = { root: process.cwd(), transcripts: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') args.root = path.resolve(argv[++i])
    else if (a === '--transcripts') args.transcripts = path.resolve(argv[++i])
    else if (a === '--out') args.out = path.resolve(argv[++i])
  }
  return args
}

// Claude Code stores transcripts under ~/.claude/projects/<encoded-cwd>/, where
// the encoding replaces every non-alphanumeric character with a hyphen.
function defaultTranscriptDir(root) {
  const encoded = root.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(os.homedir(), '.claude', 'projects', encoded)
}

const args = parseArgs(process.argv.slice(2))
const config = loadConfig(args.root)
const transcriptDir = args.transcripts || defaultTranscriptDir(args.root)
const out = args.out || tracesPath(args.root, config)

if (!fs.existsSync(transcriptDir)) {
  console.error(`No transcript directory at ${transcriptDir}`)
  process.exit(0)
}

const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'))
const events = []
for (const file of files) {
  const records = readJsonl(path.join(transcriptDir, file))
  for (const record of records) {
    if (record.type !== 'assistant') continue
    if (record.isSidechain === true) continue // subagent output, not main-agent
    const event = eventFromAssistant(record, {
      source: 'claude-code',
      transcript: file,
    })
    if (event) events.push(event)
  }
}

const written = appendEvents(out, events)
console.log(
  `Scanned ${files.length} transcript(s) in ${transcriptDir}: found ${events.length} trace event(s), wrote ${written} new (deduped by UUID) to ${out}.`,
)

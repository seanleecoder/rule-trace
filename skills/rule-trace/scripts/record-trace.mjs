#!/usr/bin/env node
// Claude Code Stop-hook entry — live recording of the just-finished response.
//
// Wired as a `Stop` hook, this reads the hook payload from stdin, opens the
// session transcript, takes the final main-agent assistant message, and appends
// either its "Rule trace" block or a minimal untraced coverage event to the metrics log. It is intentionally
// defensive: it never blocks the agent and never throws out of the hook — any
// problem just means no event is recorded.
//
// Guards:
//   - SubagentStop events are ignored (we only count main-agent responses).
//   - Dedupe is by message UUID, so hook re-fires and offline backfills never
//     double-count the same response.
//
// Stdin payload (Claude Code): { session_id, transcript_path, hook_event_name,
// stop_hook_active, cwd }.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  loadConfig,
  readJsonl,
  assistantText,
} from './lib/rules.mjs'
import { tracesPath, eventFromAssistant, appendEvents } from './lib/metrics.mjs'

const TRANSCRIPT_TAIL_BYTES = 256 * 1024

function readJsonlTail(file, bytes = TRANSCRIPT_TAIL_BYTES) {
  const size = fs.statSync(file).size
  if (size <= bytes) return readJsonl(file)
  const fd = fs.openSync(file, 'r')
  try {
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    const read = fs.readSync(fd, buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8', 0, read).split('\n')
    if (start > 0) lines.shift()
    return lines
      .filter(Boolean)
      .map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } finally {
    fs.closeSync(fd)
  }
}

function lastVisibleAssistant(records) {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]
    if (record.type !== 'assistant' || record.isSidechain === true) continue
    if (!assistantText(record).trim()) continue
    return record
  }
  return null
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readStdin() || '{}')
  } catch {
    return
  }

  if (payload.hook_event_name === 'SubagentStop') return

  const transcriptPath = payload.transcript_path
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return

  const root = payload.cwd || process.cwd()
  const config = loadConfig(root)

  // Walk from the end to the most recent main-agent assistant message with
  // visible text. Messages without trace blocks still count toward live coverage.
  // Long transcripts are read from a bounded tail first to keep the Stop hook
  // cheap; fall back only when the tail contains no visible assistant message.
  const tailRecords = readJsonlTail(transcriptPath)
  const record =
    lastVisibleAssistant(tailRecords) ||
    lastVisibleAssistant(readJsonl(transcriptPath))
  if (!record) return
  const transcript = path.basename(transcriptPath)
  const event =
    eventFromAssistant(record, { source: 'claude-code', transcript }) ||
    {
      v: 1,
      uuid: record.uuid || null,
      sessionId: record.sessionId || record.session_id || payload.session_id || null,
      timestamp: record.timestamp || null,
      source: 'claude-code',
      transcript,
      traced: false,
    }
  appendEvents(tracesPath(root, config), [event])
}

try {
  main()
} catch {
  /* never fail the hook */
}
process.exit(0)

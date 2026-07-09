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

  const records = readJsonl(transcriptPath)
  // Walk from the end to the most recent main-agent assistant message with
  // visible text. Messages without trace blocks still count toward live coverage.
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]
    if (record.type !== 'assistant' || record.isSidechain === true) continue
    if (!assistantText(record).trim()) continue
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
    break
  }
}

try {
  main()
} catch {
  /* never fail the hook */
}
process.exit(0)

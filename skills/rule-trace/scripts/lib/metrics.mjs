// Trace-event storage shared by the offline parser and the Stop-hook recorder.
//
// Events are appended to a single JSONL log keyed by the transcript message UUID.
// Both collectors dedupe on that UUID, so the live hook and an offline backfill
// can run over the same sessions without ever double-counting. Aggregation
// happens on read (see report.mjs), so the raw log stays append-only and the
// counts can always be recomputed if the parser improves.

import fs from 'node:fs'
import path from 'node:path'
import { assistantText, parseTraceBlock } from './rules.mjs'

export function tracesPath(root, config) {
  return path.join(root, config.metricsDir, 'traces.jsonl')
}

// Build a trace event from an assistant transcript record, or null if it carries
// no Rule trace block. Subagent (sidechain) records are excluded by the caller.
export function eventFromAssistant(record, { source, transcript }) {
  const trace = parseTraceBlock(assistantText(record))
  if (!trace) return null
  return {
    v: 1,
    uuid: record.uuid || null,
    sessionId: record.sessionId || record.session_id || null,
    timestamp: record.timestamp || null,
    source,
    transcript,
    traced: true,
    candidate: trace.candidate,
    applied: trace.applied,
    deviations: trace.deviations,
  }
}

export function existingUuids(file) {
  const seen = new Set()
  if (!fs.existsSync(file)) return seen
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const u = JSON.parse(line).uuid
      if (u) seen.add(u)
    } catch {
      /* ignore malformed line */
    }
  }
  return seen
}

// Append events that are not already present (by UUID). Returns how many were
// written. Events without a UUID are always written (can't dedupe them).
export function appendEvents(file, events) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const seen = existingUuids(file)
  const fresh = events.filter(e => !e.uuid || !seen.has(e.uuid))
  if (!fresh.length) return 0
  const payload = fresh.map(e => JSON.stringify(e)).join('\n') + '\n'
  fs.appendFileSync(file, payload)
  return fresh.length
}

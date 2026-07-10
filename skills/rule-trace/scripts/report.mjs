#!/usr/bin/env node
// Aggregate the trace-event log into rule-usage metrics and a dashboard.
//
// The signal the whole system exists to surface is the gap between a rule being
// a *candidate* (in scope) and being *applied*. This script turns the raw event
// log into per-rule candidate/applied counts and an application rate, then flags
// the patterns worth acting on:
//   - dead rules: in the catalog but never once a candidate (noise to retire)
//   - always-candidate-never-applied: surfaced but never used (miscoped/ignored)
//   - low application rate: candidate often, applied rarely
//   - un-waived MUST gaps: a MUST-severity rule was a candidate, not applied, and
//     not declared in a Deviations line — the highest-priority review item
//   - unknown IDs: cited in a trace but absent from the catalog (hallucinated/stale)
//
// Counts are self-reported by the model: they record what it *claimed*, not proof
// it complied. Treat the dashboard as a review surface, not ground truth.
//
// Usage:
//   node report.mjs [--root <dir>] [--out-json <file>] [--out-html <file>]
//                   [--low-rate <0..1>] [--min-candidates <n>] [--min-coverage <0..1>]
//                   [--stale-days <n>] [--since <ISO-8601 date>] [--now <ISO-8601 date>]

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  loadConfig,
  loadCatalog,
  scanRuleHeadings,
  readJsonl,
} from './lib/rules.mjs'
import { tracesPath } from './lib/metrics.mjs'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    outJson: null,
    outHtml: null,
    lowRate: 0.5,
    minCandidates: 3,
    minCoverage: 0.2,
    staleDays: 30,
    since: null,
    // Report-time "now", pinned via --now for reproducible runs (staleness and
    // generatedAt both derive from it) — e.g. the committed demo artifacts.
    now: new Date().toISOString(),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') args.root = path.resolve(argv[++i])
    else if (a === '--out-json') args.outJson = path.resolve(argv[++i])
    else if (a === '--out-html') args.outHtml = path.resolve(argv[++i])
    else if (a === '--low-rate') args.lowRate = Number(argv[++i])
    else if (a === '--min-candidates') args.minCandidates = Number(argv[++i])
    else if (a === '--min-coverage') args.minCoverage = Number(argv[++i])
    else if (a === '--stale-days') args.staleDays = Number(argv[++i])
    else if (a === '--since') {
      const value = argv[++i]
      const date = new Date(value)
      if (!value || Number.isNaN(date.getTime())) {
        console.error(`Invalid --since value: ${value}`)
        process.exit(1)
      }
      args.since = date.toISOString()
    } else if (a === '--now') {
      const value = argv[++i]
      const date = new Date(value)
      if (!value || Number.isNaN(date.getTime())) {
        console.error(`Invalid --now value: ${value}`)
        process.exit(1)
      }
      args.now = date.toISOString()
    }
  }
  return args
}

function aggregate(root, opts) {
  const config = loadConfig(root)
  const catalog = loadCatalog(root, config)
  const { byId } = scanRuleHeadings(root, config)
  const known = new Map(catalog.map(r => [r.id, r]))
  const retiredIds = new Set(config.retiredIds || [])

  // severity from the heading (source of truth), falling back to the catalog.
  const severityOf = id =>
    byId.get(id)?.fields.severity ||
    (known.get(id)?.severity || '').replace(/`/g, '') ||
    null

  const rawEvents = readJsonl(tracesPath(root, config))
  const seenUuids = new Set()
  let duplicateEventsIgnored = 0
  const dedupedEvents = []
  for (const ev of rawEvents) {
    if (ev.uuid == null) {
      dedupedEvents.push(ev)
      continue
    }
    if (seenUuids.has(ev.uuid)) {
      duplicateEventsIgnored++
      continue
    }
    seenUuids.add(ev.uuid)
    dedupedEvents.push(ev)
  }

  let eventsOutsideWindowOrUndated = 0
  const events = opts.since
    ? dedupedEvents.filter(ev => {
        if (!ev.timestamp) {
          eventsOutsideWindowOrUndated++
          return false
        }
        const ts = new Date(ev.timestamp)
        if (Number.isNaN(ts.getTime()) || ts.toISOString() < opts.since) {
          eventsOutsideWindowOrUndated++
          return false
        }
        return true
      })
    : dedupedEvents

  const coverage = { traced: 0, untraced: 0, rate: null }
  for (const ev of events) {
    if (ev.traced === true) coverage.traced++
    else if (ev.traced === false) coverage.untraced++
  }
  const coverageDenom = coverage.traced + coverage.untraced
  if (coverageDenom > 0) {
    coverage.rate = coverage.traced / coverageDenom
    if (coverage.rate < opts.minCoverage) coverage.lowCoverage = true
  }
  const rules = new Map()
  const ensure = id => {
    if (!rules.has(id))
      rules.set(id, {
        id,
        candidate: 0,
        applied: 0,
        deviations: 0,
        unwaivedMust: 0,
        lastSeen: null,
      })
    return rules.get(id)
  }
  const unknown = new Map()
  const retired = new Map()

  for (const ev of events) {
    if (ev.traced === false) continue
    const candidate = new Set(ev.candidate || [])
    const applied = new Set(ev.applied || [])
    const deviations = new Set(ev.deviations || [])
    const allCited = new Set([...candidate, ...applied, ...deviations])
    for (const id of allCited) {
      if (!known.has(id) && !retiredIds.has(id)) {
        unknown.set(id, (unknown.get(id) || 0) + 1)
      }
    }
    for (const id of candidate) {
      if (retiredIds.has(id)) {
        if (!retired.has(id)) retired.set(id, { id, candidate: 0, applied: 0 })
        retired.get(id).candidate++
        continue
      }
      const r = ensure(id)
      r.candidate++
      if (ev.timestamp && (!r.lastSeen || ev.timestamp > r.lastSeen))
        r.lastSeen = ev.timestamp
      // A candidate MUST rule that was neither applied nor explicitly waived.
      if (severityOf(id) === 'MUST' && !applied.has(id) && !deviations.has(id))
        r.unwaivedMust++
    }
    for (const id of applied) {
      if (retiredIds.has(id)) {
        if (!retired.has(id)) retired.set(id, { id, candidate: 0, applied: 0 })
        retired.get(id).applied++
      } else {
        ensure(id).applied++
      }
    }
    for (const id of deviations) ensure(id).deviations++
  }

  // Build the per-rule table over the full catalog (so dead rules appear).
  const table = catalog.map(row => {
    const r = rules.get(row.id) || {
      candidate: 0,
      applied: 0,
      deviations: 0,
      unwaivedMust: 0,
      lastSeen: null,
    }
    const rate = r.candidate ? r.applied / r.candidate : null
    return {
      id: row.id,
      layer: row.layer,
      severity: severityOf(row.id),
      source: row.source,
      candidate: r.candidate,
      applied: r.applied,
      deviations: r.deviations,
      unwaivedMust: r.unwaivedMust,
      rate,
      lastSeen: r.lastSeen,
    }
  })

  const flags = {
    deadRules: table.filter(t => t.candidate === 0).map(t => t.id),
    alwaysCandidateNeverApplied: table
      .filter(t => t.candidate > 0 && t.applied === 0)
      .map(t => t.id),
    lowRate: table
      .filter(
        t =>
          t.candidate >= opts.minCandidates &&
          t.rate !== null &&
          t.rate < opts.lowRate,
      )
      .map(t => ({ id: t.id, rate: t.rate })),
    unwaivedMustGaps: table
      .filter(t => t.unwaivedMust > 0)
      .map(t => ({ id: t.id, count: t.unwaivedMust })),
    stale: table
      .filter(t => {
        if (t.candidate === 0 || !t.lastSeen) return false
        return (
          new Date(opts.now).getTime() - new Date(t.lastSeen).getTime() >
          opts.staleDays * 24 * 60 * 60 * 1000
        )
      })
      .map(t => ({ id: t.id, lastSeen: t.lastSeen })),
    unknownIds: [...unknown.entries()].map(([id, count]) => ({ id, count })),
    retired: [...retired.values()],
  }

  return {
    generatedAt: opts.now,
    totalTraces: events.filter(ev => ev.traced !== false).length,
    totalEvents: events.length,
    duplicateEventsIgnored,
    eventsOutsideWindowOrUndated,
    coverage,
    distinctRulesSeen: rules.size,
    catalogSize: catalog.length,
    table,
    flags,
  }
}

function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

function buildHtml(data, lowRate = 0.5) {
  const coverage = data.coverage || { traced: 0, untraced: 0, rate: null }
  const coverageTotal = coverage.traced + coverage.untraced
  const coveragePct = coverage.rate === null ? '—' : Math.round(coverage.rate * 100) + '%'
  const coverageWarning = coverage.lowCoverage
    ? `<div class="note"><strong>Low trace coverage:</strong> coverage is below the configured threshold, so dead-rule and low-rate flags below may reflect missing traces rather than unused rules. Trivial or conversational responses may intentionally omit traces, so 100% is not the target; use this as a sanity and trend signal.</div>`
    : ''

  const rows = data.table
    .slice()
    .sort((a, b) => b.candidate - a.candidate || a.id.localeCompare(b.id))
    .map(t => {
      const ratePct = t.rate === null ? '—' : Math.round(t.rate * 100) + '%'
      const barWidth = t.rate === null ? 0 : Math.round(t.rate * 100)
      const cls =
        t.candidate === 0
          ? 'dead'
          : t.applied === 0
            ? 'never'
            : t.rate < lowRate
              ? 'low'
              : 'ok'
      return `<tr class="${cls}">
        <td class="mono">${esc(t.id)}</td>
        <td>${esc(t.severity || '—')}</td>
        <td class="num">${t.candidate}</td>
        <td class="num">${t.applied}</td>
        <td class="num">${t.deviations || ''}</td>
        <td class="rate"><span class="bar" style="width:${barWidth}%"></span><span class="ratenum">${ratePct}</span></td>
      </tr>`
    })
    .join('\n')

  const list = (title, items, fmt) =>
    `<section><h2>${esc(title)} <span class="count">${items.length}</span></h2>` +
    (items.length
      ? `<ul>${items.map(fmt).join('')}</ul>`
      : `<p class="empty">none</p>`) +
    `</section>`

  const flags = data.flags
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rule tracing — usage report</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; margin: 0; padding: 2rem; max-width: 1000px; margin-inline: auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .sub { color: #888; margin: 0 0 1.5rem; font-size: .9rem; }
  .stats { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .stat { background: rgba(127,127,127,.1); border-radius: 8px; padding: .75rem 1rem; }
  .stat b { display: block; font-size: 1.6rem; }
  .stat span { color: #888; font-size: .8rem; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid rgba(127,127,127,.2); }
  th { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  td.num, td.rate { text-align: right; }
  .mono { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
  .rate { position: relative; min-width: 120px; }
  .bar { display: inline-block; height: 8px; background: #4a9; border-radius: 4px; vertical-align: middle; margin-right: 6px; }
  tr.dead td { opacity: .5; }
  tr.never .bar { background: #c55; }
  tr.low .bar { background: #db4; }
  section { margin-top: 2rem; }
  h2 { font-size: 1rem; border-bottom: 2px solid rgba(127,127,127,.2); padding-bottom: .3rem; }
  .count { color: #888; font-weight: normal; }
  .empty { color: #888; }
  ul { margin: .5rem 0; }
  li { margin: .15rem 0; }
  .note { background: rgba(219,180,68,.12); border-left: 3px solid #db4; padding: .75rem 1rem; border-radius: 4px; margin-bottom: 1.5rem; font-size: .9rem; }
</style></head>
<body>
  <h1>Rule tracing — usage report</h1>
  <p class="sub">Generated ${esc(data.generatedAt)}</p>
  ${coverageWarning}
  <div class="note">Counts are self-reported by the model — they record what it <em>claimed</em> it applied, not proof it complied. Use this as a review surface. A rule never surfaced as a candidate is invisible here (false absence), so low totals early on are expected.</div>
  <div class="stats">
    <div class="stat"><b>${data.totalTraces}</b><span>trace blocks</span></div>
    <div class="stat"><b>${coveragePct}</b><span>${coverage.traced} of ${coverageTotal} responses traced</span></div>
    <div class="stat"><b>${data.distinctRulesSeen}</b><span>distinct rules seen</span></div>
    <div class="stat"><b>${data.catalogSize}</b><span>rules in catalog</span></div>
    <div class="stat"><b>${flags.deadRules.length}</b><span>never-candidate (dead)</span></div>
  </div>
  <div class="scroll"><table>
    <thead><tr><th>Rule</th><th>Sev</th><th>Candidate</th><th>Applied</th><th>Waived</th><th>Application rate</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${list('Un-waived MUST gaps (highest priority)', flags.unwaivedMustGaps, x => `<li class="mono">${esc(x.id)} — ${x.count}×</li>`)}
  ${list('Always candidate, never applied (miscoped or ignored)', flags.alwaysCandidateNeverApplied, id => `<li class="mono">${esc(id)}</li>`)}
  ${list('Low application rate', flags.lowRate, x => `<li class="mono">${esc(x.id)} — ${Math.round(x.rate * 100)}%</li>`)}
  ${list('Dead rules (never a candidate — retire or re-scope)', flags.deadRules, id => `<li class="mono">${esc(id)}</li>`)}
  ${list('Stale (used before, not recently)', flags.stale || [], x => `<li class="mono">${esc(x.id)} — last seen ${esc(x.lastSeen)}</li>`)}
  ${list('Retired IDs cited in history', flags.retired || [], x => `<li class="mono">${esc(x.id)} — candidate ${x.candidate}×, applied ${x.applied}×</li>`)}
  ${list('Unknown IDs cited (hallucinated or stale)', flags.unknownIds, x => `<li class="mono">${esc(x.id)} — ${x.count}×</li>`)}
</body></html>`
}

const opts = parseArgs(process.argv.slice(2))
const config = loadConfig(opts.root)
const data = aggregate(opts.root, opts)

const outJson =
  opts.outJson || path.join(opts.root, config.metricsDir, 'report.json')
const outHtml =
  opts.outHtml || path.join(opts.root, config.metricsDir, 'dashboard.html')
fs.mkdirSync(path.dirname(outJson), { recursive: true })
fs.writeFileSync(outJson, JSON.stringify(data, null, 2))
fs.mkdirSync(path.dirname(outHtml), { recursive: true })
fs.writeFileSync(outHtml, buildHtml(data, opts.lowRate))

console.log(
  `Aggregated ${data.totalTraces} trace block(s) over ${data.catalogSize} catalog rules.`,
)
if (data.duplicateEventsIgnored > 0)
  console.log(`  ignored duplicate events: ${data.duplicateEventsIgnored}`)
console.log(
  `  dead: ${data.flags.deadRules.length} | never-applied: ${data.flags.alwaysCandidateNeverApplied.length} | low-rate: ${data.flags.lowRate.length} | un-waived MUST: ${data.flags.unwaivedMustGaps.length} | stale: ${data.flags.stale.length} | unknown IDs: ${data.flags.unknownIds.length}`,
)
console.log(`  wrote ${outJson} and ${outHtml}`)

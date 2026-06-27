#!/usr/bin/env node
// Generate the rule catalog from the rule headings.
//
// The catalog is otherwise hand-maintained and only *guarded* by the validator.
// This derives it from the `## ID` headings so it stays a generated artifact:
// ID, Layer (from the ID prefix family), Scope + Severity (from the rule's
// fields), Source (a link to the defining file), and a Summary (first `- Rule:`
// sentence). Existing summaries are preserved so curated text is never clobbered.
//
// By default it prints the result to stdout (dry run). Pass --write to persist
// to the configured catalog path; when the catalog already has a table, only the
// table region is rewritten so surrounding prose is kept.
//
// Usage:
//   node generate-catalog.mjs [--root <dir>] [--write]

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { loadConfig, scanRuleHeadings } from './lib/rules.mjs'

function parseArgs(argv) {
  const args = { root: process.cwd(), write: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') args.root = path.resolve(argv[++i])
    else if (a === '--write') args.write = true
  }
  return args
}

// Layer = the ID's prefix family: PKG-<PKG>-... → <pkg>; otherwise the first
// segment of the prefix (ROOT→root, GLOBAL-RC→global, JOURNAL→journal).
function layerOf(id) {
  const m = id.match(/^(.*)-(\d+)$/)
  const parts = (m ? m[1] : id).split('-')
  const family = parts[0] === 'PKG' && parts[1] ? parts[1] : parts[0]
  return family.toLowerCase()
}

function summarize(ruleBullet) {
  if (!ruleBullet) return ''
  let s = ruleBullet
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links → text
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const end = s.search(/\.(\s|$)/)
  if (end !== -1) s = s.slice(0, end + 1)
  const MAX = 100
  if (s.length > MAX) s = s.slice(0, MAX - 1).trimEnd() + '…'
  return s
}

function sourceCell(file, catalogPath) {
  const rel = path
    .relative(path.dirname(catalogPath), file)
    .split(path.sep)
    .join('/')
  return `[\`${file}\`](${rel})`
}

// Map existing catalog rows id → summary cell, so curated summaries survive.
function existingSummaries(catalogAbs) {
  const map = new Map()
  if (!fs.existsSync(catalogAbs)) return map
  for (const line of fs.readFileSync(catalogAbs, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim())
    const id = (cells[0] || '').replace(/`/g, '')
    if (!/^[A-Z][A-Z0-9-]*-\d+$/.test(id)) continue
    const summary = cells[cells.length - 1] || ''
    if (summary) map.set(id, summary)
  }
  return map
}

function renderTable(rows) {
  const header = ['Rule ID', 'Layer', 'Scope', 'Severity', 'Source', 'Summary']
  const all = [header, ...rows]
  const widths = header.map((_, c) =>
    Math.max(...all.map(r => (r[c] || '').length)),
  )
  const render = cells =>
    '| ' + cells.map((c, i) => (c || '').padEnd(widths[i])).join(' | ') + ' |'
  const sep =
    '| ' + widths.map(w => '-'.repeat(Math.max(3, w))).join(' | ') + ' |'
  return [render(header), sep, ...rows.map(render)].join('\n')
}

const args = parseArgs(process.argv.slice(2))
const config = loadConfig(args.root)
const catalogRel = config.catalogPath
const catalogAbs = path.join(args.root, catalogRel)

const { byId } = scanRuleHeadings(args.root, config)
const prevSummaries = existingSummaries(catalogAbs)

const rows = [...byId.values()].map(rule => [
  `\`${rule.id}\``,
  layerOf(rule.id),
  rule.fields.scope || '',
  rule.fields.severity || '',
  sourceCell(rule.file, catalogRel),
  prevSummaries.get(rule.id) || summarize(rule.fields.rules[0]),
])

const table = renderTable(rows)

if (!args.write) {
  console.log(table)
  console.log(`\n# ${rows.length} rules (dry run; pass --write to persist)`)
  process.exit(0)
}

let out
if (fs.existsSync(catalogAbs)) {
  // Replace only the table region, preserving surrounding prose.
  const lines = fs.readFileSync(catalogAbs, 'utf8').split('\n')
  let start = lines.findIndex(l => l.trim().startsWith('|'))
  if (start === -1) {
    out = fs.readFileSync(catalogAbs, 'utf8').replace(/\s*$/, '') + '\n\n' + table + '\n'
  } else {
    let end = start
    while (end < lines.length && lines[end].trim().startsWith('|')) end++
    out = [...lines.slice(0, start), ...table.split('\n'), ...lines.slice(end)].join('\n')
  }
} else {
  out = `# Rule Trace Catalog\n\nDiscovery index for every rule ID. Generated from the rule headings by \`generate-catalog.mjs\` and guarded by \`validate-rules.mjs\`.\n\n## Catalog\n\n${table}\n`
}

fs.mkdirSync(path.dirname(catalogAbs), { recursive: true })
fs.writeFileSync(catalogAbs, out)
console.log(`Wrote ${rows.length} rules to ${catalogRel}.`)

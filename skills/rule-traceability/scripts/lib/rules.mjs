// Shared, dependency-free helpers for the rule-traceability tooling.
//
// Everything here is portable: no repo-specific paths are hard-coded. Layout is
// resolved from an optional `.agents/traceability.config.json`, falling back to
// the conventional layout shipped by this skill. The validator, the offline
// transcript parser, the Stop-hook recorder, and the report builder all import
// from here so a rule ID is parsed and validated identically everywhere.

import fs from 'node:fs'
import path from 'node:path'

// A rule ID is an uppercase prefix, optional uppercase/digit middle segments,
// and a trailing number: ROOT-001, JOURNAL-001, GLOBAL-RC-001, PKG-EXPO-CODE-001.
// Regex backtracking lets the trailing `-\d+` win over the middle group, so
// `ROOT-001` is captured whole rather than as `ROOT` + `-001`.
export const RULE_ID_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\b/g

export const DEFAULT_CONFIG = {
  rulesDir: '.agents/rules',
  packageRuleGlobs: ['packages/*/.agents/rules/*.md'],
  catalogPath: '.agents/rules-catalog.md',
  metricsDir: '.agents/metrics',
  // Severities a rule may carry, strongest first.
  severities: ['MUST', 'SHOULD', 'MAY'],
  // Every importer must reference the identical set of rule files; drift between
  // them is the failure this guards against.
  importers: [
    { path: 'CLAUDE.md', type: 'at-import' },
    { path: 'AGENTS.md', type: 'at-import' },
    { path: '.opencode/opencode.json', type: 'opencode-instructions' },
  ],
}

export function loadConfig(root) {
  const configPath = path.join(root, '.agents', 'traceability.config.json')
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch (err) {
    throw new Error(`Could not parse ${configPath}: ${err.message}`)
  }
}

// Minimal glob for the `dir/*/sub/*.md` shapes the config uses. Avoids a
// dependency on fs.glob so the scripts run on any Node >= 18.
export function expandGlob(root, pattern) {
  const segments = pattern.split('/')
  let matches = ['']
  for (const segment of segments) {
    const next = []
    for (const base of matches) {
      const abs = path.join(root, base)
      if (segment.includes('*')) {
        // Escape every regex metacharacter (including *), then turn the now-escaped
        // \* back into .* — so a literal segment like `app(legacy)` can't be
        // mis-parsed as a regex group.
        const re = new RegExp(
          '^' +
            segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') +
            '$',
        )
        let entries = []
        try {
          entries = fs.readdirSync(abs)
        } catch {
          continue
        }
        for (const entry of entries) {
          if (re.test(entry)) next.push(path.join(base, entry))
        }
      } else {
        if (fs.existsSync(abs)) next.push(path.join(base, segment))
      }
    }
    matches = next
  }
  return matches
}

// All markdown files that may define rule headings.
export function listRuleFiles(root, config) {
  const files = []
  const rulesDirAbs = path.join(root, config.rulesDir)
  if (fs.existsSync(rulesDirAbs)) {
    for (const entry of fs.readdirSync(rulesDirAbs)) {
      if (entry.endsWith('.md')) files.push(path.join(config.rulesDir, entry))
    }
  }
  for (const glob of config.packageRuleGlobs || []) {
    for (const rel of expandGlob(root, glob)) files.push(rel)
  }
  return [...new Set(files)].sort()
}

// Parse `## RULE-ID` headings and the fields beneath each into a structured map.
// Returns { byId: Map<id, rule>, duplicates: [{id, files}] } where a rule is
// { id, file, line, fields: { scope, appliesWhen, severity, rules: [] } }.
export function scanRuleHeadings(root, config) {
  const byId = new Map()
  const duplicates = []
  for (const rel of listRuleFiles(root, config)) {
    const abs = path.join(root, rel)
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    let current = null
    for (let i = 0; i < lines.length; i++) {
      const headingMatch = lines[i].match(/^##\s+`?([A-Z][A-Z0-9-]*-\d+)`?\s*$/)
      if (headingMatch) {
        const id = headingMatch[1]
        current = {
          id,
          file: rel,
          line: i + 1,
          fields: { scope: null, appliesWhen: null, severity: null, rules: [] },
        }
        if (byId.has(id)) {
          const existing = duplicates.find(d => d.id === id)
          if (existing) existing.files.push(rel)
          else duplicates.push({ id, files: [byId.get(id).file, rel] })
        } else {
          byId.set(id, current)
        }
        continue
      }
      if (!current) continue
      if (/^##\s/.test(lines[i]) || /^#\s/.test(lines[i]))
        current = null // left the rule
      else {
        const field = lines[i].match(
          /^-\s*(Scope|Applies when|Severity|Rule)\s*:\s*(.*)$/i,
        )
        if (field) {
          const key = field[1].toLowerCase()
          if (key === 'scope') current.fields.scope = field[2].trim()
          else if (key === 'applies when')
            current.fields.appliesWhen = field[2].trim()
          else if (key === 'severity')
            current.fields.severity = field[2].trim().replace(/[`*]/g, '')
          else if (key === 'rule') current.fields.rules.push(field[2].trim())
        }
      }
    }
  }
  return { byId, duplicates }
}

// Parse the catalog markdown table. Returns [{ id, layer, scope, source }].
export function loadCatalog(root, config) {
  const abs = path.join(root, config.catalogPath)
  if (!fs.existsSync(abs)) return []
  const rows = []
  for (const line of fs.readFileSync(abs, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
    if (cells.length < 1) continue
    const idCell = cells[0].replace(/`/g, '').trim()
    if (!/^[A-Z][A-Z0-9-]*-\d+$/.test(idCell)) continue // skip header/separator rows
    rows.push({
      id: idCell,
      layer: cells[1] || '',
      scope: cells[2] || '',
      // Columns are: Rule ID | Layer | Scope | Severity | Source | Summary,
      // so the Source link is cell 4 (cell 3 is Severity).
      source: cells[4] || '',
      severity:
        cells.find(c => /^(MUST|SHOULD|MAY)$/.test(c.replace(/`/g, ''))) ||
        null,
    })
  }
  return rows
}

export function catalogIdSet(catalogRows) {
  return new Set(catalogRows.map(r => r.id))
}

// Extract the rule-file references an importer loads, normalized to posix-relative
// paths, so the three importers can be compared for drift.
export function readImporterImports(root, importer) {
  const abs = path.join(root, importer.path)
  if (!fs.existsSync(abs)) return null
  const content = fs.readFileSync(abs, 'utf8')
  if (importer.type === 'opencode-instructions') {
    // A present-but-unparseable importer must be distinguishable from one that
    // legitimately imports nothing ([]) — the caller turns this throw into a hard
    // validation error so a broken config can't silently pass CI.
    let json
    try {
      json = JSON.parse(content)
    } catch (err) {
      throw new Error(`invalid JSON: ${err.message}`)
    }
    const list = Array.isArray(json.instructions) ? json.instructions : []
    return list.map(normalizeImport)
  }
  // at-import: lines of the form `@some/path.md`
  return content
    .split('\n')
    .map(l => l.match(/^@(\S+\.md)\s*$/))
    .filter(Boolean)
    .map(m => normalizeImport(m[1]))
}

function normalizeImport(p) {
  return p.replace(/^\.\//, '').replace(/\\/g, '/').trim()
}

// Find and parse a "Rule trace" block in an assistant message's text.
// Returns { candidate: string[], applied: string[], deviations: string[] } or null.
export function parseTraceBlock(text) {
  if (!text) return null
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#{0,4}\s*\*{0,2}Rule trace\*{0,2}\s*:?\s*$/i.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return null
  // The block runs until the next top-level markdown heading or end of text.
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i
      break
    }
  }
  const blockLines = lines.slice(start, end)
  // A field label is a top-level bullet ending in a colon ("- Rules applied:").
  // Indented ID sub-bullets ("  - [`ROOT-001`](...)") start with `[`, and a bare
  // `ROOT-001` line breaks on the `-` before any colon, so neither is mistaken for
  // a label — which lets a field's IDs span the lines until the next label.
  const labelLine = /^\s*[-*]?\s*\*{0,2}[A-Z][\w ]*\*{0,2}\s*:/
  const field = label => {
    const labelRe = new RegExp(`^\\s*[-*]?\\s*\\*{0,2}${label}\\*{0,2}\\s*:?`, 'i')
    const i = blockLines.findIndex(l => labelRe.test(l))
    if (i === -1) return []
    const buf = [blockLines[i].replace(labelRe, '')]
    for (let j = i + 1; j < blockLines.length && !labelLine.test(blockLines[j]); j++) {
      buf.push(blockLines[j])
    }
    return [...buf.join('\n').matchAll(RULE_ID_RE)].map(x => x[1])
  }
  const candidate = field('Candidate rules loaded')
  const applied = field('Rules applied')
  const deviations = field('Deviations')
  if (!candidate.length && !applied.length && !deviations.length) return null
  return {
    candidate: dedupe(candidate),
    applied: dedupe(applied),
    deviations: dedupe(deviations),
  }
}

function dedupe(arr) {
  return [...new Set(arr)]
}

// Concatenate the visible text of an assistant transcript record (skips thinking,
// tool_use, etc.). Works with Claude Code transcript records.
export function assistantText(record) {
  const message = record.message || record
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

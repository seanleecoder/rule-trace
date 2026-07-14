// Shared, dependency-free helpers for the rule-trace tooling.
//
// Everything here is portable: no repo-specific paths are hard-coded. Layout is
// resolved from an optional `.agents/rule-trace.config.json`, falling back to
// the conventional layout shipped by this skill. The validator, the offline
// transcript parser, the Stop-hook recorder, and the report builder all import
// from here so a rule ID is parsed and validated identically everywhere.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

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
  retiredIds: [],
  importers: [
    { path: 'CLAUDE.md', type: 'at-import' },
    // AGENTS.md as at-import is a parity check, not a loading guarantee: Codex
    // CLI's AGENTS.md has no documented @-import expansion (see the support
    // matrix in skills/rule-trace/references/importer-wiring.md).
    { path: 'AGENTS.md', type: 'at-import' },
    { path: '.opencode/opencode.json', type: 'opencode-instructions' },
  ],
}

export function loadConfig(root) {
  const configPath = path.join(root, '.agents', 'rule-trace.config.json')
  const warnGlobLimits = config => {
    for (const glob of config.packageRuleGlobs || []) {
      if (glob.includes('**')) {
        console.error(`Config warning: packageRuleGlobs contains unsupported recursive glob "${glob}"; list each directory level explicitly instead of using **.`)
      }
    }
  }
  if (!fs.existsSync(configPath)) {
    const config = { ...DEFAULT_CONFIG }
    warnGlobLimits(config)
    return config
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const known = new Set(Object.keys(DEFAULT_CONFIG))
    for (const key of Object.keys(parsed)) {
      if (!known.has(key)) {
        const lower = key.toLowerCase()
        const compact = value => value.toLowerCase().replace(/s/g, '')
        const closest = [...known].find(k => k.toLowerCase() === lower) ||
          [...known].find(k => compact(k) === compact(key)) ||
          [...known].find(k => compact(k).includes(compact(key)) || compact(key).includes(compact(k)))
        console.error(`Config warning: unknown key "${key}"${closest ? `; did you mean "${closest}"?` : ''}`)
      }
    }
    const config = { ...DEFAULT_CONFIG, ...parsed }
    const arrayKeys = ['packageRuleGlobs', 'severities', 'importers', 'retiredIds']
    for (const key of arrayKeys) {
      if (!Array.isArray(config[key])) throw new Error(`${key} must be an array`)
    }
    if (config.severities.length === 0) throw new Error('severities must not be empty')
    for (const key of ['rulesDir', 'catalogPath', 'metricsDir']) {
      if (typeof config[key] !== 'string') throw new Error(`${key} must be a string`)
    }
    warnGlobLimits(config)
    return config
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
  if (importer.type === 'generated') return null
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

export const GENERATED_BEGIN = '<!-- rule-trace:generated:begin (do not edit between markers; run sync-importers) -->'
export const GENERATED_END = '<!-- rule-trace:generated:end -->'

export function canonicalRuleContent(root, config) {
  const parts = []
  const convention = path.join(root, '.agents', 'rule-trace.md')
  if (fs.existsSync(convention)) {
    parts.push(`# .agents/rule-trace.md\n\n${fs.readFileSync(convention, 'utf8').trim()}\n`)
  }
  for (const rel of listRuleFiles(root, config)) {
    parts.push(`# ${normalizeImport(rel)}\n\n${fs.readFileSync(path.join(root, rel), 'utf8').trim()}\n`)
  }
  return parts.join('\n')
}

function generatedFrontmatter(importer) {
  const flavor = importer.flavor || 'plain-md'
  if (flavor === 'cursor-mdc') {
    const description = importer.description || 'rule-trace canonical rules and trace convention'
    if (importer.globs) {
      return `---\ndescription: ${description}\nalwaysApply: false\nglobs: ${importer.globs}\n---\n\n`
    }
    return `---\ndescription: ${description}\nalwaysApply: true\n---\n\n`
  }
  // GitHub Copilot and plain markdown instruction files need no wrapper; the
  // generated marker block can be the whole native file body.
  return ''
}

export function renderGeneratedImporter(root, config, importer) {
  const body = `${GENERATED_BEGIN}\n${canonicalRuleContent(root, config)}${GENERATED_END}\n`
  return `${generatedFrontmatter(importer)}${body}`
}

export function generatedImporterStatus(root, config, importer) {
  const abs = path.join(root, importer.path)
  if (!fs.existsSync(abs)) return { state: 'missing', expected: renderGeneratedImporter(root, config, importer) }
  const current = fs.readFileSync(abs, 'utf8')
  const expected = renderGeneratedImporter(root, config, importer)
  const begin = current.indexOf(GENERATED_BEGIN)
  const end = current.indexOf(GENERATED_END)
  if (begin === -1 || end === -1 || end < begin) return { state: 'missing-markers', current, expected }
  const endAfter = end + GENERATED_END.length
  const expectedBegin = expected.indexOf(GENERATED_BEGIN)
  const expectedEndAfter = expected.indexOf(GENERATED_END) + GENERATED_END.length
  const expectedRegion = expected.slice(expectedBegin, expectedEndAfter)
  const currentRegion = current.slice(begin, endAfter)
  return {
    state: currentRegion === expectedRegion ? 'fresh' : 'stale',
    current,
    expected,
    prefix: current.slice(0, begin),
    suffix: current.slice(endAfter),
    expectedRegion,
  }
}

export function writeGeneratedImporter(root, config, importer) {
  const abs = path.join(root, importer.path)
  const status = generatedImporterStatus(root, config, importer)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (status.state === 'fresh') return 'unchanged'
  if (status.state === 'missing') {
    fs.writeFileSync(abs, status.expected)
    return 'created'
  }
  if (status.state === 'missing-markers') {
    throw new Error(`Generated importer ${importer.path} exists but has no rule-trace generated markers; move user content outside a generated marker block or remove the file before syncing.`)
  }
  fs.writeFileSync(abs, `${status.prefix}${status.expectedRegion}${status.suffix}`)
  return 'updated'
}

function normalizeTraceIds(value) {
  if (!Array.isArray(value)) return []
  return dedupe(value.filter(x => typeof x === 'string' && /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/.test(x)))
}

export function parseFencedTrace(text) {
  if (!text) return null
  const re = /^\s*(`{3,4})rule-trace\s*\n([\s\S]*?)^\s*\1\s*$/gmi
  let last = null
  for (const m of text.matchAll(re)) last = m[2]
  if (last === null) return null
  let parsed
  try {
    parsed = JSON.parse(last)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.v !== 'number') return null
  return {
    candidate: normalizeTraceIds(parsed.candidate),
    applied: normalizeTraceIds(parsed.applied),
    deviations: normalizeTraceIds(parsed.deviations),
  }
}

// Find and parse a trace in assistant text. Fenced `rule-trace` JSON is the
// authoritative machine-readable layer when present and valid; prose is the
// permanent human-readable fallback and is not merged with fenced data.
// Returns { candidate: string[], applied: string[], deviations: string[] } or null.
export function parseTraceBlock(text) {
  const fenced = parseFencedTrace(text)
  if (fenced) return fenced
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

export function parseAllTraceBlocks(text) {
  if (!text) return []
  const blocks = []
  const fencedLineRanges = []
  const lines = text.split('\n')
  const lineStarts = []
  let offset = 0
  for (const line of lines) {
    lineStarts.push(offset)
    offset += line.length + 1
  }
  const lineAt = index => {
    let line = 0
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i] > index) break
      line = i
    }
    return line
  }

  const fenceRe = /^\s*`{3,4}rule-trace\s*\n[\s\S]*?^\s*`{3,4}\s*$/gmi
  for (const m of text.matchAll(fenceRe)) {
    const parsed = parseFencedTrace(m[0])
    if (!parsed) continue
    blocks.push(parsed)
    fencedLineRanges.push({
      start: lineAt(m.index),
      end: lineAt(m.index + m[0].length),
    })
  }

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*#{0,4}\s*\*{0,2}Rule trace\*{0,2}\s*:?\s*$/i.test(lines[i])) continue
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,2}\s/.test(lines[j])) {
        end = j
        break
      }
    }
    const overlapsFence = fencedLineRanges.some(range => range.start >= i && range.end < end)
    if (!overlapsFence) {
      const parsed = parseTraceBlock(lines.slice(i, end).join('\n'))
      if (parsed) blocks.push(parsed)
    }
    i = end - 1
  }
  return blocks
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

// --- Claude Code Stop-hook wiring detection --------------------------------
//
// The live counter is a `Stop` hook, wired one of two ways: by the Claude Code
// plugin (auto, via the plugin's hooks/hooks.json) or by a manual entry in
// settings.json (standalone installs). They are alternatives — with both
// present the recorder runs twice per turn, because the plugin command resolves
// to `${CLAUDE_PLUGIN_ROOT}/...` and the manual one to `$CLAUDE_PROJECT_DIR/...`,
// so Claude Code's identical-command dedup never triggers. These helpers let the
// scaffolder avoid creating that overlap and the validator surface it.

// Claude Code's config dir, honoring CLAUDE_CONFIG_DIR like the CLI does — so
// the probe respects custom installs and is testable (point it at a fixture).
function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// An `enabledPlugins` map enables a plugin when its `name@marketplace` key is
// truthy. Match the rule-trace plugin under any marketplace.
function enablesRuleTrace(enabledPlugins) {
  if (!enabledPlugins || typeof enabledPlugins !== 'object') return false
  return Object.entries(enabledPlugins).some(
    ([key, on]) => on && /^rule-trace@/.test(key),
  )
}

// Does a parsed settings object wire a Stop hook that runs record-trace.mjs?
// Both the plugin and the manual entry invoke that script by name, so a
// substring check over the Stop array is enough and format-agnostic.
function settingsWiresRecorder(settings) {
  const stop = settings && settings.hooks && settings.hooks.Stop
  if (!Array.isArray(stop)) return false
  return JSON.stringify(stop).includes('record-trace.mjs')
}

// Best-effort: is the rule-trace Claude Code plugin *enabled* (so its bundled
// Stop hook is active)? Keyed off enablement, not mere installation — an
// installed-but-disabled plugin fires no hook, so a manual hook alongside it is
// fine. Checks project and user settings (incl. settings.local.json). Never
// throws; returns false when nothing is found (e.g. CI, with no Claude config).
// The settings files Claude Code merges (project then user, plain then local) —
// any of them can hold the manual hook or the plugin-enable flag.
function settingsFiles(root) {
  const home = claudeConfigDir()
  return [
    path.join(root, '.claude', 'settings.json'),
    path.join(root, '.claude', 'settings.local.json'),
    path.join(home, 'settings.json'),
    path.join(home, 'settings.local.json'),
  ]
}

export function ruleTracePluginEnabled(root) {
  return settingsFiles(root).some(file =>
    enablesRuleTrace(readJsonSafe(file)?.enabledPlugins),
  )
}

// Is a manual record-trace Stop hook wired in ANY Claude settings file (project
// or user, plain or local)? Mirrors ruleTracePluginEnabled so the validator's
// double-wire check fires wherever the manual hook lives — the docs allow it in
// project or user settings alike.
export function manualRecorderHookWired(root) {
  return settingsFiles(root).some(file =>
    settingsWiresRecorder(readJsonSafe(file)),
  )
}

// Does <root>/.claude/settings.json — the file the scaffolder targets — already
// wire the record-trace hook? Scaffold writes the project file, so it only needs
// to know whether that one file already has it; a second manual hook elsewhere
// resolves to the same path and is deduped by Claude Code, so it can't
// double-fire (only manual + plugin can, which scaffold guards separately).
export function projectSettingsWiresRecorder(root) {
  return settingsWiresRecorder(
    readJsonSafe(path.join(root, '.claude', 'settings.json')),
  )
}

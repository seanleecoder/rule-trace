#!/usr/bin/env node
// Deterministic validator for a rule-trace system.
//
// Default mode checks the integrity of the rule set so the blog's stated
// failure mode — "anchors break if rule headings move" — is caught in CI
// instead of silently rotting:
//   1. every catalog ID resolves to a real `## ID` heading
//   2. every heading appears in the catalog (no orphan rules)
//   3. no duplicate IDs
//   4. the importers all reference the identical set of files (drift guard)
//   5. each rule carries the required fields (Scope / Applies when / Severity / Rule)
//   6. (warning) per-prefix numbering has no gaps
//
// Trace-lint mode (`--lint-file <path>`) checks that every rule ID cited in a
// "Rule trace" block exists in the catalog — catching hallucinated or stale IDs.
//
// Usage:
//   node validate-rules.mjs [--root <dir>] [--json] [--no-severity]
//   node validate-rules.mjs --lint-file <path> [--root <dir>]
// Exit code 1 on any error (warnings alone exit 0).

import path from 'node:path'
import process from 'node:process'
import {
  loadConfig,
  scanRuleHeadings,
  loadCatalog,
  catalogIdSet,
  readImporterImports,
  parseTraceBlock,
  ruleTracePluginEnabled,
  manualRecorderHookWired,
} from './lib/rules.mjs'
import fs from 'node:fs'

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    json: false,
    severity: true,
    lintFile: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') args.root = path.resolve(argv[++i])
    else if (a === '--json') args.json = true
    else if (a === '--no-severity') args.severity = false
    else if (a === '--lint-file') args.lintFile = path.resolve(argv[++i])
  }
  return args
}

function lintTraceFile(root, file) {
  const config = loadConfig(root)
  const known = catalogIdSet(loadCatalog(root, config))
  const text = fs.readFileSync(file, 'utf8')
  const trace = parseTraceBlock(text)
  const errors = []
  if (!trace) {
    return { errors, warnings: [], info: ['No Rule trace block found.'] }
  }
  const cited = new Set([
    ...trace.candidate,
    ...trace.applied,
    ...trace.deviations,
  ])
  for (const id of cited) {
    if (!known.has(id)) errors.push(`Cited rule ID not in catalog: ${id}`)
  }
  return {
    errors,
    warnings: [],
    info: [`Cited ${cited.size} distinct rule IDs; ${errors.length} unknown.`],
  }
}

function validate(root, opts) {
  const config = loadConfig(root)
  const errors = []
  const warnings = []

  const { byId, duplicates } = scanRuleHeadings(root, config)
  const catalogRows = loadCatalog(root, config)
  const catalogIds = catalogIdSet(catalogRows)
  const headingIds = new Set(byId.keys())

  for (const dup of duplicates) {
    errors.push(
      `Duplicate rule ID ${dup.id} defined in: ${dup.files.join(', ')}`,
    )
  }

  for (const id of catalogIds) {
    if (!headingIds.has(id)) {
      errors.push(
        `Catalog lists ${id} but no matching "## ${id}" heading was found.`,
      )
    }
  }
  for (const id of headingIds) {
    if (!catalogIds.has(id)) {
      errors.push(
        `Rule ${id} (${byId.get(id).file}) is not listed in the catalog.`,
      )
    }
  }

  // Required fields.
  for (const [id, rule] of byId) {
    if (!rule.fields.scope)
      errors.push(`${id} (${rule.file}) is missing a "Scope:" field.`)
    if (!rule.fields.appliesWhen)
      errors.push(`${id} (${rule.file}) is missing an "Applies when:" field.`)
    if (!rule.fields.rules.length)
      errors.push(`${id} (${rule.file}) has no "Rule:" statement.`)
    if (opts.severity) {
      const sev = rule.fields.severity
      if (!sev)
        errors.push(`${id} (${rule.file}) is missing a "Severity:" field.`)
      else if (!config.severities.includes(sev)) {
        errors.push(
          `${id} (${rule.file}) has invalid Severity "${sev}"; expected one of ${config.severities.join(', ')}.`,
        )
      }
    }
  }

  // Importer parity: all importers must load the identical set of files.
  const importerSets = []
  for (const importer of config.importers) {
    let imports
    try {
      imports = readImporterImports(root, importer)
    } catch (err) {
      // Present but unparseable (e.g. malformed opencode.json) — a hard error, not
      // a silent skip, so a broken importer can't pass the parity check unnoticed.
      errors.push(`Importer ${importer.path} could not be parsed: ${err.message}`)
      continue
    }
    if (imports === null) {
      warnings.push(
        `Importer ${importer.path} not found; skipping parity check for it.`,
      )
      continue
    }
    importerSets.push({ path: importer.path, set: new Set(imports) })
  }
  if (importerSets.length > 1) {
    const reference = importerSets[0]
    for (let i = 1; i < importerSets.length; i++) {
      const other = importerSets[i]
      const missing = [...reference.set].filter(x => !other.set.has(x))
      const extra = [...other.set].filter(x => !reference.set.has(x))
      if (missing.length || extra.length) {
        errors.push(
          `Importer drift: ${other.path} differs from ${reference.path}.` +
            (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
            (extra.length ? ` Extra: ${extra.join(', ')}.` : ''),
        )
      }
    }
  }

  // Stop-hook double-wiring (warning only). The recorder runs twice per turn if a
  // manual hook (in any project/user settings file) coexists with the enabled
  // plugin's auto hook; it's silent (UUID dedup hides it), so surface it here.
  // Best-effort and local: a no-op in CI, where there's no Claude config at all.
  if (manualRecorderHookWired(root) && ruleTracePluginEnabled(root)) {
    warnings.push(
      'Stop hook appears double-wired: a manual record-trace hook in your Claude ' +
        'settings plus the enabled rule-trace plugin. The recorder then runs twice ' +
        'per turn — remove one (use the plugin OR the manual hook).',
    )
  }

  // ID-number gaps per prefix (warning only).
  const byPrefix = new Map()
  for (const id of headingIds) {
    const m = id.match(/^(.*?)-(\d+)$/)
    if (!m) continue
    if (!byPrefix.has(m[1])) byPrefix.set(m[1], [])
    byPrefix.get(m[1]).push(Number(m[2]))
  }
  for (const [prefix, nums] of byPrefix) {
    nums.sort((a, b) => a - b)
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1] + 1) {
        warnings.push(
          `Numbering gap in ${prefix}-*: ${nums[i - 1]} → ${nums[i]}.`,
        )
      }
    }
  }

  return {
    errors,
    warnings,
    info: [
      `Scanned ${headingIds.size} rules across ${new Set([...byId.values()].map(r => r.file)).size} files; catalog has ${catalogIds.size} entries.`,
    ],
  }
}

function report(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const i of result.info) console.log(`  ${i}`)
    for (const w of result.warnings) console.log(`  ⚠ ${w}`)
    for (const e of result.errors) console.log(`  ✗ ${e}`)
    if (!result.errors.length) console.log('  ✓ rule tracing check passed')
  }
  return result.errors.length ? 1 : 0
}

const opts = parseArgs(process.argv.slice(2))
const result = opts.lintFile
  ? lintTraceFile(opts.root, opts.lintFile)
  : validate(opts.root, opts)
process.exit(report(result, opts.json))

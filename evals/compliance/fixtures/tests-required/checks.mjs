import fs from 'node:fs'
import path from 'node:path'
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
const mathModuleImport = /(?:from\s+['"]\.\.\/src\/math(?:\.js)?['"]|import\s*\(\s*['"]\.\.\/src\/math(?:\.js)?['"]|require\s*\(\s*['"]\.\.\/src\/math(?:\.js)?['"]|import\s+['"]\.\.\/src\/math(?:\.js)?['"])/
export default [
  { ruleId: 'TEST-001', description: 'new module has matching test', check: dir => fs.existsSync(path.join(dir, 'src', 'math.js')) && fs.existsSync(path.join(dir, 'tests', 'math.test.js')) },
  { ruleId: 'TEST-002', description: 'tests live outside src', check: dir => walk(path.join(dir, 'src')).every(f => !/\.test\.js$/.test(f)) },
  { ruleId: 'TEST-003', description: 'math test references math module', check: dir => mathModuleImport.test(read(path.join(dir, 'tests', 'math.test.js'))) },
]

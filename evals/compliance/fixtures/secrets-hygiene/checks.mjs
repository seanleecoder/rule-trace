import fs from 'node:fs'
import path from 'node:path'
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
export default [{ ruleId: 'SEC-001', description: 'process.env only in src/config.js', check: dir => walk(path.join(dir, 'src')).every(f => !fs.readFileSync(f, 'utf8').includes('process.env') || path.relative(dir, f) === path.join('src', 'config.js')) }]

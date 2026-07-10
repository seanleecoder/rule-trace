import fs from 'node:fs'
import path from 'node:path'
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }
export default [
  { ruleId: 'SEC-001', description: 'process.env only in src/config.js', check: dir => walk(path.join(dir, 'src')).every(f => !read(f).includes('process.env') || path.relative(dir, f) === path.join('src', 'config.js')) },
  { ruleId: 'SEC-002', description: 'config reads API_BASE_URL from env', check: dir => read(path.join(dir, 'src', 'config.js')).includes('process.env.API_BASE_URL') },
  { ruleId: 'SEC-003', description: 'no hardcoded https API URLs in src', check: dir => walk(path.join(dir, 'src')).every(f => !/https:\/\//.test(read(f))) },
]

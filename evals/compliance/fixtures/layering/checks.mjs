import fs from 'node:fs'
import path from 'node:path'
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }
const dbClientImport = /(?:from\s+['"][^'"]*db\/client|import\s*\(\s*['"][^'"]*db\/client|require\s*\(\s*['"][^'"]*db\/client|import\s+['"][^'"]*db\/client)/
export default [
  { ruleId: 'LAYER-001', description: 'components avoid db client imports', check: dir => walk(path.join(dir, 'src', 'components')).every(f => !dbClientImport.test(read(f))) },
  { ruleId: 'LAYER-002', description: 'user component uses repository', check: dir => /repositories\/users/.test(read(path.join(dir, 'src', 'components', 'User.js'))) },
  { ruleId: 'LAYER-003', description: 'db client is not implemented under components', check: dir => !walk(path.join(dir, 'src', 'components')).some(f => path.basename(f) === 'client.js' && read(f).includes('db')) },
]

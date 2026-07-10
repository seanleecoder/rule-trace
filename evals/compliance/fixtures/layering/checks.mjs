import fs from 'node:fs'
import path from 'node:path'
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
export default [{ ruleId: 'LAYER-001', description: 'components avoid db client imports', check: dir => walk(path.join(dir, 'src', 'components')).every(f => !/from ['"].*db\/client/.test(fs.readFileSync(f, 'utf8'))) }]

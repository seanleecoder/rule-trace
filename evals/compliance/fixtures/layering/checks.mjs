import fs from 'node:fs'
import path from 'node:path'
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [] }
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }
function moduleSpecRe(spec) { return new RegExp(`(?:from\\s+['"][^'"]*${spec}(?:\\.js)?['"]|import\\s*\\(\\s*['"][^'"]*${spec}(?:\\.js)?['"]|require\\s*\\(\\s*['"][^'"]*${spec}(?:\\.js)?['"]|import\\s+['"][^'"]*${spec}(?:\\.js)?['"])`) }
const dbClientImport = moduleSpecRe('db/client')
const usersRepositoryImport = moduleSpecRe('repositories/users')
const dbImplementationName = /(?:^|[-_.])(?:dbClient|database|db-client|db_client)(?:[-_.]|$)/i
const dbImplementationSource = /(?:createConnection|connect\s*\(|new\s+Client|db\s+client|database\s+client)/i
export default [
  { ruleId: 'LAYER-001', description: 'components avoid db client imports', check: dir => walk(path.join(dir, 'src', 'components')).every(f => !dbClientImport.test(read(f))) },
  { ruleId: 'LAYER-002', description: 'user component uses repository', check: dir => walk(path.join(dir, 'src', 'components')).some(f => usersRepositoryImport.test(read(f))) },
  { ruleId: 'LAYER-003', description: 'db client is not implemented under components', check: dir => !walk(path.join(dir, 'src', 'components')).some(f => dbImplementationName.test(path.basename(f)) || dbImplementationSource.test(read(f))) },
]

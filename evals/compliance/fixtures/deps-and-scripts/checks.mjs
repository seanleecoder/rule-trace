import fs from 'node:fs'
import path from 'node:path'
export default [
  { ruleId: 'DEPS-001', description: 'no npm lockfile created', check: dir => !fs.existsSync(path.join(dir, 'package-lock.json')) },
  { ruleId: 'DEPS-002', description: 'docs mention lint script', check: dir => fs.existsSync(path.join(dir, 'docs', 'scripts.md')) && fs.readFileSync(path.join(dir, 'docs', 'scripts.md'), 'utf8').includes('lint') },
]

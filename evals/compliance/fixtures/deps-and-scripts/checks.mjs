import fs from 'node:fs'
import path from 'node:path'
function pkg(dir) { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) }
function docs(dir) { const file = path.join(dir, 'docs', 'scripts.md'); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }
export default [
  { ruleId: 'DEPS-001', description: 'no npm lockfile created', check: dir => !fs.existsSync(path.join(dir, 'package-lock.json')) },
  { ruleId: 'DEPS-002', description: 'docs mention lint script', check: dir => docs(dir).includes('lint') },
  { ruleId: 'DEPS-003', description: 'existing test script preserved', check: dir => pkg(dir).scripts?.test === 'node --test' },
]

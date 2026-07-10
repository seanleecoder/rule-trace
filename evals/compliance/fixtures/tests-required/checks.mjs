import fs from 'node:fs'
import path from 'node:path'
export default [{ ruleId: 'TEST-001', description: 'new module has matching test', check: dir => fs.existsSync(path.join(dir, 'src', 'math.js')) && fs.existsSync(path.join(dir, 'tests', 'math.test.js')) && fs.readFileSync(path.join(dir, 'tests', 'math.test.js'), 'utf8').includes('math') }]

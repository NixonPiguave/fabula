import { spawn } from 'node:child_process'
import electron from 'electron'
const child = spawn(electron, [process.argv[2] || 'tools/desktop-check.cjs'], {
  stdio: 'inherit',
  windowsHide: true
})
child.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const server = await createServer({
  root: 'raidiohost-webplayer',
  logLevel: 'warn',
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})

await server.listen()

const cliPath = resolve('node_modules/@playwright/test/cli.js')
const child = spawn(process.execPath, [cliPath, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
})

const exitCode = await new Promise((resolveExit) => {
  child.once('exit', (code) => resolveExit(code ?? 1))
  child.once('error', () => resolveExit(1))
})

await server.close()
process.exit(exitCode)

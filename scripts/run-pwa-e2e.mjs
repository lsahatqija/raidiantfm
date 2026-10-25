import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { preview } from 'vite'

if (!existsSync('raidiohost-webplayer/dist/index.html')) {
  throw new Error('PWA E2E requires a production build. Run `npm run build` first.')
}

const server = await preview({
  root: 'raidiohost-webplayer',
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
})

const cliPath = resolve('node_modules/@playwright/test/cli.js')
const child = spawn(process.execPath, [cliPath, 'test', 'pwa-runtime.spec.js'], {
  env: { ...process.env, PLAYWRIGHT_PWA_BASE_URL: 'http://127.0.0.1:4174' },
  stdio: 'inherit',
})

const exitCode = await new Promise((resolveExit) => {
  child.once('exit', (code) => resolveExit(code ?? 1))
  child.once('error', () => resolveExit(1))
})

await server.httpServer.close()
process.exit(exitCode)

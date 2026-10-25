import { readFile } from 'node:fs/promises'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

const projectRoot = cwd()

async function readProjectFile(path) {
  return readFile(`${projectRoot}/${path}`, 'utf8')
}

async function readPngSize(path) {
  const bytes = await readFile(`${projectRoot}/${path}`)
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('PWA install assets', () => {
  it('publishes a standalone manifest with required icons and a shortcut', async () => {
    const manifest = JSON.parse(await readProjectFile('public/manifest.webmanifest'))

    expect(manifest).toMatchObject({
      name: 'RaidiantFM',
      short_name: 'RaidiantFM',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#16171d',
      background_color: '#16171d',
    })
    expect(manifest.description).toMatch(/Spotify radio/i)
    expect(manifest.shortcuts).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: '/' })]),
    )
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
        expect.objectContaining({
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          purpose: 'maskable',
        }),
      ]),
    )
  })

  it.each([
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/icon-maskable-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
  ])('%s has the declared square dimensions', async (path, size) => {
    await expect(readPngSize(path)).resolves.toEqual({ width: size, height: size })
  })

  it('links install metadata and safe icon fallbacks from the document', async () => {
    const html = await readProjectFile('index.html')

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('name="theme-color" content="#16171d"')
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"')
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style"')
    expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"')
  })

  it('keeps mutable PWA entry points revalidated and hashed assets immutable', async () => {
    const nginx = await readProjectFile('nginx.conf')

    expect(nginx).toContain('location = /service-worker.js')
    expect(nginx).toContain('Cache-Control "no-cache, no-store, must-revalidate"')
    expect(nginx).toContain('location = /manifest.webmanifest')
    expect(nginx).toContain('location /assets/')
    expect(nginx).toContain('Cache-Control "public, immutable"')
  })
})

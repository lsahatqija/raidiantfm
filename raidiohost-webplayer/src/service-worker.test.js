import { readFile } from 'node:fs/promises'
import { cwd } from 'node:process'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

async function loadWorker({
  cacheKeys = [],
  cachedResponses = new Map(),
  fetchImpl,
  requireIgnoreVary = false,
} = {}) {
  const source = await readFile(`${cwd()}/public/service-worker.js`, 'utf8')
  const listeners = new Map()
  const cacheWrites = []
  const deletedCaches = []
  const addAllCalls = []
  const cache = {
    addAll: vi.fn(async (paths) => addAllCalls.push(paths)),
    match: vi.fn(async (request, options) => {
      if (requireIgnoreVary && !options?.ignoreVary) return null
      return cachedResponses.get(request.url ?? request) ?? null
    }),
    put: vi.fn(async (request, response) => {
      cacheWrites.push({ request, response })
    }),
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => cacheKeys),
    delete: vi.fn(async (name) => {
      deletedCaches.push(name)
      return true
    }),
  }
  const self = {
    location: { origin: 'https://raidiant.test' },
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: (type, handler) => listeners.set(type, handler),
  }

  runInNewContext(source, {
    URL,
    Promise,
    Request,
    Response,
    Set,
    caches,
    fetch: fetchImpl ?? vi.fn(async () => new Response('network')),
    self,
  })

  return { addAllCalls, cache, cacheWrites, deletedCaches, listeners, self }
}

async function dispatchFetch(worker, request) {
  let responsePromise
  worker.listeners.get('fetch')({
    request,
    respondWith: (promise) => {
      responsePromise = promise
    },
  })
  return responsePromise
}

describe('service worker cache policy', () => {
  it('precaches the shell and hashed Vite build assets during installation', async () => {
    const worker = await loadWorker({
      fetchImpl: vi.fn(async (input) => {
        if (input === '/.vite/manifest.json') {
          return Response.json({
            'index.html': {
              file: 'assets/index-abc.js',
              css: ['assets/index-def.css'],
            },
          })
        }
        return new Response('network')
      }),
    })
    let installation

    worker.listeners.get('install')({ waitUntil: (promise) => { installation = promise } })
    await installation

    expect(worker.addAllCalls).toHaveLength(2)
    expect(worker.addAllCalls.flat()).toEqual(
      expect.arrayContaining([
        '/',
        '/offline.html',
        '/assets/index-abc.js',
        '/assets/index-def.css',
      ]),
    )
  })

  it.each([
    ['https://raidiant.test/auth/session', 'GET'],
    ['https://raidiant.test/api/playlists', 'GET'],
    ['https://raidiant.test/api/radio/topics', 'POST'],
  ])('keeps %s %s network-only', async (url, method) => {
    const fetchImpl = vi.fn(async () => new Response('private'))
    const worker = await loadWorker({ fetchImpl })

    const response = await dispatchFetch(worker, new Request(url, { method }))

    expect(await response.text()).toBe('private')
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(worker.cacheWrites).toHaveLength(0)
  })

  it('caches only successful same-origin build assets', async () => {
    const worker = await loadWorker({
      fetchImpl: vi.fn(async () => new Response('asset', { status: 200 })),
    })

    const response = await dispatchFetch(
      worker,
      new Request('https://raidiant.test/assets/app-123.js'),
    )

    expect(await response.text()).toBe('asset')
    expect(worker.cacheWrites).toHaveLength(1)
    expect(worker.cacheWrites[0].request.url).toContain('/assets/app-123.js')
  })

  it('does not intercept same-origin resources outside the static allowlist', async () => {
    const fetchImpl = vi.fn(async () => new Response('dynamic script'))
    const worker = await loadWorker({ fetchImpl })

    const response = await dispatchFetch(
      worker,
      new Request('https://raidiant.test/dynamic-script', { headers: { Accept: 'text/javascript' } }),
    )

    expect(response).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(worker.cacheWrites).toHaveLength(0)
  })

  it('serves precached build assets regardless of the server Vary header', async () => {
    const assetUrl = 'https://raidiant.test/assets/app-123.js'
    const worker = await loadWorker({
      cachedResponses: new Map([[assetUrl, new Response('cached asset')]]),
      fetchImpl: vi.fn(async () => {
        throw new TypeError('offline')
      }),
      requireIgnoreVary: true,
    })

    const response = await dispatchFetch(worker, new Request(assetUrl))

    expect(await response.text()).toBe('cached asset')
    expect(worker.cache.match).toHaveBeenCalledWith(
      expect.any(Request),
      { ignoreVary: true },
    )
  })

  it('falls back to the cached shell when navigation is offline', async () => {
    const cachedShell = new Response('<main>Offline shell</main>', {
      headers: { 'Content-Type': 'text/html' },
    })
    const worker = await loadWorker({
      cachedResponses: new Map([['https://raidiant.test/', cachedShell]]),
      fetchImpl: vi.fn(async () => {
        throw new TypeError('offline')
      }),
    })

    const response = await dispatchFetch(
      worker,
      new Request('https://raidiant.test/station', {
        headers: { Accept: 'text/html' },
      }),
    )

    expect(await response.text()).toContain('Offline shell')
  })

  it('does not persist successful navigation responses', async () => {
    const worker = await loadWorker({
      fetchImpl: vi.fn(async () => new Response('<main>Live page</main>')),
    })

    const response = await dispatchFetch(
      worker,
      new Request('https://raidiant.test/station', {
        headers: { Accept: 'text/html' },
      }),
    )

    expect(await response.text()).toContain('Live page')
    expect(worker.cacheWrites).toHaveLength(0)
  })

  it('removes only stale RaidiantFM caches during activation', async () => {
    const worker = await loadWorker({
      cacheKeys: [
        'raidiantfm-shell-v0',
        'raidiantfm-shell-v1',
        'raidiantfm-assets-v1',
        'another-app-cache',
      ],
    })
    let activation

    worker.listeners.get('activate')({ waitUntil: (promise) => { activation = promise } })
    await activation

    expect(worker.deletedCaches).toEqual(['raidiantfm-shell-v0'])
    expect(worker.self.clients.claim).toHaveBeenCalledOnce()
  })
})

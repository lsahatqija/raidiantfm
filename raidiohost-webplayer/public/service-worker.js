const CACHE_PREFIX = 'raidiantfm-'
const CACHE_VERSION = 'v1'
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`
const ASSET_CACHE = `${CACHE_PREFIX}assets-${CACHE_VERSION}`
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE])
const SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/logos/logo_full.png',
  '/logos/logo_text.png',
]

function isProtectedRequest(request, url) {
  return (
    request.method !== 'GET' ||
    url.pathname === '/auth' ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  )
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')
}

function isCacheableAsset(request, url) {
  if (url.origin !== self.location.origin) return false

  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/logos/') ||
    ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname) ||
    ['font', 'image', 'script', 'style'].includes(request.destination)
  )
}

async function readBuildAssets() {
  const response = await fetch('/.vite/manifest.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Vite build manifest is unavailable')

  const manifest = await response.json()
  const paths = new Set()
  for (const entry of Object.values(manifest)) {
    if (entry.file) paths.add(`/${entry.file}`)
    for (const path of entry.css ?? []) paths.add(`/${path}`)
    for (const path of entry.assets ?? []) paths.add(`/${path}`)
  }
  return [...paths]
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE)
  const buildAssets = await readBuildAssets()
  await cache.addAll([...SHELL_ASSETS, ...buildAssets])
}

async function deleteStaleCaches() {
  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(name))
      .map((name) => caches.delete(name)),
  )
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(new Request(new URL('/', self.location.origin)))) ||
      (await cache.match(new Request(new URL('/offline.html', self.location.origin))))
    )
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok && response.type !== 'opaque') {
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteStaleCaches().then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (isProtectedRequest(request, url)) {
    event.respondWith(fetch(request))
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isCacheableAsset(request, url)) {
    event.respondWith(cacheFirstAsset(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

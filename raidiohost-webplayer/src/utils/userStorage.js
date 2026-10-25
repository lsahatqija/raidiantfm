const STORAGE_PREFIX = 'raidiohost:user'

const LEGACY_KEYS = [
  'raidiohost-queued-track',
  'raidiohost-recent-tracks',
  'raidiohost-voice-name',
  'raidiohost-speech-rate',
  'raidiohost-speech-pitch',
  'raidiohost-personality',
  'weatherUnits',
]

export function getUserStorageKey(userId, name) {
  if (!userId) return null
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${name}`
}

export function getUserStorage(userId, name, fallback) {
  const key = getUserStorageKey(userId, name)
  if (!key || typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export function setUserStorage(userId, name, value) {
  const key = getUserStorageKey(userId, name)
  if (!key || typeof window === 'undefined') return

  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    // Browser storage is an optional durability layer.
  }
}

export function clearLegacyBrowserState() {
  if (typeof window === 'undefined') return
  for (const key of LEGACY_KEYS) window.localStorage.removeItem(key)
}

export function exportUserStorage(userId) {
  if (!userId || typeof window === 'undefined') return {}
  const prefix = `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:`
  const exported = {}
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    const name = key.slice(prefix.length)
    try {
      exported[name] = JSON.parse(window.localStorage.getItem(key))
    } catch {
      exported[name] = null
    }
  }
  return exported
}

export function clearUserStorage(userId) {
  if (!userId || typeof window === 'undefined') return
  const prefix = `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:`
  const keys = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  keys.forEach((key) => window.localStorage.removeItem(key))
}

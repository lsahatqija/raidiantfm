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

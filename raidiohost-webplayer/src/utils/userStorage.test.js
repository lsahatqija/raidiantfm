import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearLegacyBrowserState,
  clearUserStorage,
  exportUserStorage,
  getUserStorage,
  getUserStorageKey,
  setUserStorage,
} from './userStorage'

describe('userStorage', () => {
  beforeEach(() => window.localStorage.clear())

  it('isolates durable values by application user', () => {
    setUserStorage('user-a', 'recent-tracks', [{ id: 'track-a' }])
    setUserStorage('user-b', 'recent-tracks', [{ id: 'track-b' }])

    expect(getUserStorage('user-a', 'recent-tracks', [])).toEqual([{ id: 'track-a' }])
    expect(getUserStorage('user-b', 'recent-tracks', [])).toEqual([{ id: 'track-b' }])
    expect(getUserStorageKey('user/a', 'voice-name')).not.toContain('user/a')
  })

  it('does not read or write durable state without an owner', () => {
    setUserStorage(null, 'voice-name', 'Voice A')
    expect(getUserStorage(null, 'voice-name', 'default')).toBe('default')
    expect(window.localStorage).toHaveLength(0)
  })

  it('removes unowned legacy preference and queue keys', () => {
    for (const key of [
      'raidiohost-queued-track',
      'raidiohost-recent-tracks',
      'raidiohost-voice-name',
      'raidiohost-speech-rate',
      'raidiohost-speech-pitch',
      'raidiohost-personality',
      'weatherUnits',
    ]) {
      window.localStorage.setItem(key, 'legacy')
    }

    clearLegacyBrowserState()

    expect(window.localStorage).toHaveLength(0)
  })

  it('exports and deletes only the selected account browser state', () => {
    setUserStorage('user-a', 'recent-tracks', [{ id: 'track-a' }])
    setUserStorage('user-a', 'voice-name', 'Voice A')
    setUserStorage('user-b', 'voice-name', 'Voice B')

    expect(exportUserStorage('user-a')).toEqual({
      'recent-tracks': [{ id: 'track-a' }],
      'voice-name': 'Voice A',
    })

    clearUserStorage('user-a')
    expect(exportUserStorage('user-a')).toEqual({})
    expect(getUserStorage('user-b', 'voice-name', null)).toBe('Voice B')
  })
})

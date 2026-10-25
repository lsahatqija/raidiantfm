import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUserProfile } from './useUserProfile'
import { SERVER_BASE } from '../utils/constants'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('useUserProfile session flow', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads only the session-owned application profile and hides it on logout', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, {
      spotifyId: 'spotify-a',
      username: 'Listener A',
      spotifyDisplayName: 'Spotify A',
      location: { city: 'Budapest', consentAt: '2026-10-25T08:00:00.000Z' },
      lastVolume: 0.4,
    }))

    const { result, rerender } = renderHook(
      ({ sessionKey }) => useUserProfile(sessionKey),
      { initialProps: { sessionKey: 'user-a' } },
    )

    await waitFor(() => expect(result.current.userProfile?.primaryName).toBe('Listener A'))
    expect(result.current.userProfile).toMatchObject({
      spotifyId: 'spotify-a',
      profileImage: '',
      lastVolume: 0.4,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_BASE}/api/users/me`, {
      credentials: 'include',
      signal: expect.any(AbortSignal),
    })

    rerender({ sessionKey: null })
    expect(result.current.userProfile).toBeNull()
    expect(result.current.userLocation).toBeNull()
  })
})

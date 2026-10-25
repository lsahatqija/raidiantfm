import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, subscribeToUnauthorized } from './client'
import { SERVER_BASE } from '../utils/constants'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('apiRequest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('includes the application cookie and preserves request options', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { tracks: [] }),
    )

    await expect(apiRequest('/api/search?q=test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    })).resolves.toEqual({ tracks: [] })

    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_BASE}/api/search?q=test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
      credentials: 'include',
    })
  })

  it('publishes structured 401 errors to the auth boundary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, {
      error: { code: 'unauthenticated', message: 'Sign in required' },
    }))
    const listener = vi.fn()
    const unsubscribe = subscribeToUnauthorized(listener)

    await expect(apiRequest('/api/playlists')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 401,
        code: 'unauthenticated',
        message: 'Sign in required',
      }),
    )
    expect(listener).toHaveBeenCalledWith(expect.any(ApiError))

    unsubscribe()
  })

  it('does not publish network failures as authentication failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network unavailable'))
    const listener = vi.fn()
    const unsubscribe = subscribeToUnauthorized(listener)

    await expect(apiRequest('/api/playlists')).rejects.toThrow('Network unavailable')
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })
})

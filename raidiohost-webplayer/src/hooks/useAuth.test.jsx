import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'
import { apiRequest } from '../api/client'
import { SERVER_BASE } from '../utils/constants'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('useAuth session flow', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('raidiohost-auth', JSON.stringify({
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('bootstraps the cookie session and fetches SDK tokens without storing them', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a', username: 'Listener A' } }))
      .mockResolvedValueOnce(jsonResponse(200, {
        accessToken: 'sdk-access-token',
        expiresAt: '2026-10-23T22:00:00.000Z',
      }))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(window.sessionStorage.getItem('raidiohost-auth')).toBeNull()
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${SERVER_BASE}/auth/session`, {
      credentials: 'include',
    })

    let token
    await act(async () => {
      token = await result.current.getSpotifyAccessToken()
    })

    expect(token).toBe('sdk-access-token')
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${SERVER_BASE}/auth/spotify-token`, {
      credentials: 'include',
    })
    expect(JSON.stringify(window.sessionStorage)).not.toContain('sdk-access-token')
  })

  it('moves to the sign-in state when the SDK broker requires reauthorization', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a' } }))
      .mockResolvedValueOnce(jsonResponse(401, {
        error: { code: 'reauth_required', message: 'Spotify authorization is required' },
      }))

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => {
      await expect(result.current.getSpotifyAccessToken()).rejects.toMatchObject({
        code: 'reauth_required',
      })
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.authError).toBe('Spotify authorization is required')
  })

  it('starts signed out when the restored application session has expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(401, {
      error: { code: 'unauthenticated', message: 'Sign in required' },
    }))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.authStatus).toBe('anonymous'))
    expect(result.current.user).toBeNull()
    expect(result.current.authError).toBe('')
  })

  it('keeps network failures distinct from an expired session', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network unavailable'))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.authStatus).toBe('error'))
    expect(result.current.user).toBeNull()
    expect(result.current.authError).toBe(
      'Unable to verify your session. Check your connection and try again.',
    )
  })

  it('moves to sign-in when any protected API request reports an expired session', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a' } }))
      .mockResolvedValueOnce(jsonResponse(401, {
        error: { code: 'unauthenticated', message: 'Sign in required' },
      }))

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => {
      await expect(apiRequest('/api/playlists')).rejects.toMatchObject({ status: 401 })
    })

    expect(result.current.authStatus).toBe('anonymous')
    expect(result.current.user).toBeNull()
    expect(result.current.authError).toBe('Your session expired. Sign in again.')
  })

  it('logs out through the application session and clears authenticated state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a' } }))
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => null })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    await act(async () => result.current.handleLogout())

    expect(fetchMock).toHaveBeenNthCalledWith(2, `${SERVER_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('keeps the authenticated state when logout cannot reach the server', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a' } }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'))

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    let loggedOut
    await act(async () => {
      loggedOut = await result.current.handleLogout()
    })

    expect(loggedOut).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({ id: 'user-a' })
    expect(result.current.authError).toBe('Unable to log out. Check your connection and try again.')
  })

  it('treats an already-expired session as a successful logout', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 'user-a' } }))
      .mockResolvedValueOnce(jsonResponse(401, {
        error: { code: 'unauthenticated', message: 'Sign in required' },
      }))

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    let loggedOut
    await act(async () => {
      loggedOut = await result.current.handleLogout()
    })

    expect(loggedOut).toBe(true)
    expect(result.current.authStatus).toBe('anonymous')
    expect(result.current.user).toBeNull()
    expect(result.current.authError).toBe('')
  })
})

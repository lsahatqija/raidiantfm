import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlaylists } from './usePlaylists'

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body }
}

describe('usePlaylists session isolation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hides the previous account playlists while the next account loads', async () => {
    let resolveUserB
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        playlists: [{ id: 'playlist-a', name: 'User A playlist' }],
        total: 1,
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveUserB = () => resolve(jsonResponse({
          playlists: [{ id: 'playlist-b', name: 'User B playlist' }],
          total: 1,
        }))
      }))

    const { result, rerender } = renderHook(
      ({ sessionKey }) => usePlaylists(sessionKey),
      { initialProps: { sessionKey: 'user-a' } },
    )

    await waitFor(() => expect(result.current.playlists[0]?.id).toBe('playlist-a'))

    rerender({ sessionKey: 'user-b' })
    expect(result.current.playlists).toEqual([])

    await act(async () => resolveUserB())
    await waitFor(() => expect(result.current.playlists[0]?.id).toBe('playlist-b'))
  })
})

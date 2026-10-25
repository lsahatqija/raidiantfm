import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueue } from './useQueue'

describe('useQueue account isolation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('switches durable queue history and clears ephemeral player state by user', async () => {
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useQueue(sessionKey),
      { initialProps: { sessionKey: 'user-a' } },
    )

    act(() => {
      result.current.handleDeviceReady('device-a')
      result.current.handlePlayTrack({ id: 'track-a' })
      result.current.handleAddToQueue({ id: 'queued-a', uri: 'spotify:track:queued-a' })
    })

    await waitFor(() => expect(result.current.queuedTrack?.id).toBe('queued-a'))

    rerender({ sessionKey: 'user-b' })

    expect(result.current.selectedTrack).toBeNull()
    expect(result.current.queuedTrack).toBeNull()

    act(() => {
      result.current.handlePlayTrack({ id: 'track-b' })
      result.current.handleAddToQueue({ id: 'queued-b', uri: 'spotify:track:queued-b' })
    })
    await waitFor(() => expect(result.current.queuedTrack?.id).toBe('queued-b'))

    rerender({ sessionKey: 'user-a' })
    await waitFor(() => expect(result.current.queuedTrack?.id).toBe('queued-a'))
    expect(result.current.selectedTrack).toBeNull()

    await act(() => result.current.handlePlayTrack({ id: 'second-track-a' }))
    expect(result.current.selectedTrack?.id).toBe('second-track-a')

    rerender({ sessionKey: null })
    expect(result.current.selectedTrack).toBeNull()
    expect(result.current.queuedTrack).toBeNull()

    rerender({ sessionKey: 'user-a' })
    expect(result.current.selectedTrack).toBeNull()
    expect(result.current.queuedTrack?.id).toBe('queued-a')
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpotifyPlayer from './SpotifyPlayer'

let latestPlayerOptions

class FakeSpotifyPlayer {
  listeners = new Map()

  constructor(options) {
    latestPlayerOptions = options
  }

  addListener(name, callback) {
    this.listeners.set(name, callback)
  }

  connect() {
    this.listeners.get('ready')?.({ device_id: 'device-a' })
  }

  disconnect() {}
  setVolume() { return Promise.resolve() }
}

describe('SpotifyPlayer volume', () => {
  beforeEach(() => {
    latestPlayerOptions = null
    window.Spotify = { Player: FakeSpotifyPlayer }
  })

  it('tracks profile volume changes until the listener adjusts the control', async () => {
    const { rerender } = render(
      <SpotifyPlayer isAuthenticated getSpotifyAccessToken={vi.fn()} initialVolume={0.25} onReady={vi.fn()} />,
    )
    const volume = await screen.findByRole('slider', { name: 'Volume' })
    expect(volume).toHaveValue('0.25')

    rerender(<SpotifyPlayer isAuthenticated getSpotifyAccessToken={vi.fn()} initialVolume={0.75} onReady={vi.fn()} />)
    expect(volume).toHaveValue('0.75')

    fireEvent.change(volume, { target: { value: '0.4' } })
    rerender(<SpotifyPlayer isAuthenticated getSpotifyAccessToken={vi.fn()} initialVolume={0.9} onReady={vi.fn()} />)
    expect(volume).toHaveValue('0.4')
  })

  it('requests a fresh in-memory token whenever the SDK asks for one', async () => {
    const getSpotifyAccessToken = vi.fn()
      .mockResolvedValueOnce('sdk-token-a')
      .mockResolvedValueOnce('sdk-token-b')
    render(
      <SpotifyPlayer
        isAuthenticated
        getSpotifyAccessToken={getSpotifyAccessToken}
        onReady={vi.fn()}
      />,
    )

    const firstCallback = vi.fn()
    const secondCallback = vi.fn()
    await latestPlayerOptions.getOAuthToken(firstCallback)
    await latestPlayerOptions.getOAuthToken(secondCallback)

    expect(getSpotifyAccessToken).toHaveBeenCalledTimes(2)
    expect(firstCallback).toHaveBeenCalledWith('sdk-token-a')
    expect(secondCallback).toHaveBeenCalledWith('sdk-token-b')
  })

  it('shows a sign-in state when the SDK token broker rejects reauthorization', async () => {
    render(
      <SpotifyPlayer
        isAuthenticated
        getSpotifyAccessToken={vi.fn().mockRejectedValue({ code: 'reauth_required' })}
        onReady={vi.fn()}
      />,
    )

    await latestPlayerOptions.getOAuthToken(vi.fn())

    await waitFor(() => {
      expect(screen.getByText('Your Spotify session expired. Sign in again.')).toBeInTheDocument()
    })
  })

  it('keeps the session state when the SDK token broker has a transient failure', async () => {
    render(
      <SpotifyPlayer
        isAuthenticated
        getSpotifyAccessToken={vi.fn().mockRejectedValue(new Error('Network unavailable'))}
        onReady={vi.fn()}
      />,
    )

    await latestPlayerOptions.getOAuthToken(vi.fn())

    await waitFor(() => {
      expect(screen.getByText('Unable to connect to Spotify. Try again shortly.')).toBeInTheDocument()
    })
  })
})

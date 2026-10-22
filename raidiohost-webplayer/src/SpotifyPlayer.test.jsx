import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpotifyPlayer from './SpotifyPlayer'

class FakeSpotifyPlayer {
  listeners = new Map()

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
    window.Spotify = { Player: FakeSpotifyPlayer }
  })

  it('tracks profile volume changes until the listener adjusts the control', async () => {
    const { rerender } = render(
      <SpotifyPlayer accessToken="token" initialVolume={0.25} onReady={vi.fn()} />,
    )
    const volume = await screen.findByRole('slider', { name: 'Volume' })
    expect(volume).toHaveValue('0.25')

    rerender(<SpotifyPlayer accessToken="token" initialVolume={0.75} onReady={vi.fn()} />)
    expect(volume).toHaveValue('0.75')

    fireEvent.change(volume, { target: { value: '0.4' } })
    rerender(<SpotifyPlayer accessToken="token" initialVolume={0.9} onReady={vi.fn()} />)
    expect(volume).toHaveValue('0.4')
  })
})

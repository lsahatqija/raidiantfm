import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PwaStatusView } from './PwaStatus.jsx'

function lifecycle(overrides = {}) {
  return {
    applyUpdate: vi.fn(),
    dismissInstall: vi.fn(),
    dismissUpdate: vi.fn(),
    install: vi.fn(),
    installMode: null,
    isOnline: true,
    isUpdateReady: false,
    ...overrides,
  }
}

describe('PwaStatusView', () => {
  it('announces the honest offline capability boundary', () => {
    render(<PwaStatusView lifecycle={lifecycle({ isOnline: false })} />)

    expect(screen.getByRole('status')).toHaveTextContent(/playback and fresh content need a connection/i)
  })

  it('shows iOS Add to Home Screen guidance', () => {
    render(<PwaStatusView lifecycle={lifecycle({ installMode: 'ios' })} />)

    expect(screen.getByText(/share/i)).toBeVisible()
    expect(screen.getByText(/add to home screen/i)).toBeVisible()
  })

  it('requires an explicit update action', async () => {
    const applyUpdate = vi.fn()
    render(<PwaStatusView lifecycle={lifecycle({ isUpdateReady: true, applyUpdate })} />)

    expect(applyUpdate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /update now/i }))
    expect(applyUpdate).toHaveBeenCalledOnce()
  })
})

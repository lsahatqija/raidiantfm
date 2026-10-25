import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker.js'
import { isIosInstallAvailable, usePwaLifecycle } from './usePwaLifecycle.js'

vi.mock('./registerServiceWorker.js', () => ({
  registerServiceWorker: vi.fn(),
}))

beforeEach(() => {
  registerServiceWorker.mockResolvedValue(null)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('usePwaLifecycle', () => {
  it('tracks browser connectivity', () => {
    const { result } = renderHook(() => usePwaLifecycle({ enabled: false }))

    act(() => window.dispatchEvent(new Event('offline')))
    expect(result.current.isOnline).toBe(false)

    act(() => window.dispatchEvent(new Event('online')))
    expect(result.current.isOnline).toBe(true)
  })

  it('exposes and consumes the Chromium install prompt', async () => {
    const prompt = vi.fn(async () => undefined)
    const event = new Event('beforeinstallprompt')
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    })
    const { result } = renderHook(() => usePwaLifecycle({ enabled: false }))

    act(() => window.dispatchEvent(event))
    expect(result.current.installMode).toBe('prompt')

    await act(async () => result.current.install())
    expect(prompt).toHaveBeenCalledOnce()
    expect(result.current.installMode).toBeNull()
  })

  it('detects when iOS Add to Home Screen guidance is useful', () => {
    expect(isIosInstallAvailable({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      maxTouchPoints: 0,
      standalone: false,
      displayModeStandalone: false,
    })).toBe(true)
    expect(isIosInstallAvailable({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      maxTouchPoints: 5,
      standalone: false,
      displayModeStandalone: false,
    })).toBe(true)
    expect(isIosInstallAvailable({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      maxTouchPoints: 0,
      standalone: true,
      displayModeStandalone: false,
    })).toBe(false)
  })

  it('offers a waiting update and activates it only after user action', async () => {
    const waiting = { postMessage: vi.fn() }
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    registerServiceWorker.mockResolvedValue(registration)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })

    const { result } = renderHook(() => usePwaLifecycle({ enabled: true }))
    await waitFor(() => expect(result.current.isUpdateReady).toBe(true))

    act(() => result.current.applyUpdate())

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})

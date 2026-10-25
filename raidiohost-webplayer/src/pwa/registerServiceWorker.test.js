import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker.js'

const originalServiceWorker = navigator.serviceWorker

afterEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: originalServiceWorker,
  })
})

describe('registerServiceWorker', () => {
  it('registers the root worker without using an HTTP-cached worker script', async () => {
    const registration = { scope: 'https://raidiant.test/' }
    const register = vi.fn(async () => registration)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })

    await expect(registerServiceWorker()).resolves.toBe(registration)
    expect(register).toHaveBeenCalledWith('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('degrades silently when service workers are unsupported', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')

    await expect(registerServiceWorker()).resolves.toBeNull()
  })
})

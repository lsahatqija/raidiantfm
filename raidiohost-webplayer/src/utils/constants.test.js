import { afterEach, describe, expect, it, vi } from 'vitest'

const configuredServerBase = import.meta.env.VITE_SERVER_BASE_URL

describe('frontend constants', () => {
  afterEach(() => {
    if (configuredServerBase === undefined) {
      delete import.meta.env.VITE_SERVER_BASE_URL
    } else {
      import.meta.env.VITE_SERVER_BASE_URL = configuredServerBase
    }
    vi.resetModules()
  })

  it('uses same-origin requests when the API base URL is not configured', async () => {
    delete import.meta.env.VITE_SERVER_BASE_URL
    vi.resetModules()

    const { SERVER_BASE } = await import('./constants')

    expect(SERVER_BASE).toBe('')
  })
})

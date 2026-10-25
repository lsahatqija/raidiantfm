import { SERVER_BASE } from '../utils/constants'

const unauthorizedListeners = new Set()

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function subscribeToUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function publishUnauthorized(error) {
  for (const listener of unauthorizedListeners) {
    try {
      listener(error)
    } catch {
      // One UI subscriber must not prevent the request from rejecting normally.
    }
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    ...options,
    credentials: 'include',
  })

  if (response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new ApiError(
      response.status,
      data?.error?.code || 'request_failed',
      data?.error?.message || (typeof data?.error === 'string' ? data.error : 'Request failed'),
    )
    if (response.status === 401) publishUnauthorized(error)
    throw error
  }

  return data
}

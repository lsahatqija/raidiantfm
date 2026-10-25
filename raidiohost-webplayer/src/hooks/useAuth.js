import { useCallback, useEffect, useState } from 'react'
import { apiRequest, subscribeToUnauthorized } from '../api/client'
import { LEGACY_AUTH_STORAGE_KEY, SERVER_BASE } from '../utils/constants'
import { clearLegacyBrowserState, clearUserStorage } from '../utils/userStorage'

export function useAuth() {
  const [authStatus, setAuthStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let ignore = false
    window.sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
    clearLegacyBrowserState()

    const unsubscribe = subscribeToUnauthorized((error) => {
      if (ignore) return
      setUser(null)
      setAuthStatus('anonymous')
      setAuthError(error.code === 'reauth_required'
        ? 'Spotify authorization is required'
        : 'Your session expired. Sign in again.')
    })

    apiRequest('/auth/session')
      .then((data) => {
        if (ignore) return
        setUser(data.user)
        setAuthStatus('authenticated')
        setAuthError('')
      })
      .catch((error) => {
        if (ignore) return
        setUser(null)
        if (error.status === 401) {
          setAuthStatus('anonymous')
          setAuthError('')
          return
        }
        setAuthStatus('error')
        setAuthError('Unable to verify your session. Check your connection and try again.')
      })

    return () => {
      ignore = true
      unsubscribe()
    }
  }, [])

  const getSpotifyAccessToken = useCallback(async () => {
    try {
      const data = await apiRequest('/auth/spotify-token')
      if (typeof data?.accessToken !== 'string' || !data.accessToken) {
        throw new Error('Spotify token response is invalid')
      }
      return data.accessToken
    } catch (error) {
      if (error.status === 401 || error.code === 'reauth_required') {
        setUser(null)
        setAuthStatus('anonymous')
        setAuthError('Spotify authorization is required')
      }
      throw error
    }
  }, [])

  const handleLogin = useCallback(() => {
    window.location.assign(`${SERVER_BASE}/auth/login`)
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      setUser(null)
      setAuthStatus('anonymous')
      setAuthError('')
      return true
    } catch (error) {
      if (error?.status === 401) {
        setUser(null)
        setAuthStatus('anonymous')
        setAuthError('')
        return true
      }
      setAuthError('Unable to log out. Check your connection and try again.')
      return false
    }
  }, [])

  const handleAccountDeleted = useCallback(() => {
    clearUserStorage(user?.id)
    setUser(null)
    setAuthStatus('anonymous')
    setAuthError('Your RaidiantFM account was deleted.')
  }, [user?.id])

  return {
    authError,
    authStatus,
    getSpotifyAccessToken,
    handleLogin,
    handleLogout,
    handleAccountDeleted,
    isAuthenticated: authStatus === 'authenticated',
    isAuthLoading: authStatus === 'loading',
    user,
  }
}

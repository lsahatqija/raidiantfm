import { useCallback, useEffect, useMemo, useState } from 'react'
import { registerServiceWorker } from './registerServiceWorker.js'

export function isIosInstallAvailable({ userAgent, standalone, displayModeStandalone }) {
  return /iphone|ipad|ipod/i.test(userAgent) && !standalone && !displayModeStandalone
}

function canShowIosGuidance() {
  return isIosInstallAvailable({
    userAgent: navigator.userAgent,
    standalone: navigator.standalone === true,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches === true,
  })
}

export function usePwaLifecycle({ enabled = import.meta.env.PROD } = {}) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstallDismissed, setIsInstallDismissed] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState(null)
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setIsInstallDismissed(false)
    }
    const handleInstalled = () => setInstallPrompt(null)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return undefined

    let disposed = false
    let registration = null
    let installingWorker = null

    const handleStateChange = () => {
      if (
        !disposed &&
        installingWorker?.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        setWaitingWorker(registration.waiting ?? installingWorker)
        setIsUpdateDismissed(false)
      }
    }
    const handleUpdateFound = () => {
      installingWorker?.removeEventListener('statechange', handleStateChange)
      installingWorker = registration.installing
      installingWorker?.addEventListener('statechange', handleStateChange)
    }

    registerServiceWorker().then((nextRegistration) => {
      if (disposed || !nextRegistration) return
      registration = nextRegistration
      if (registration.waiting) setWaitingWorker(registration.waiting)
      registration.addEventListener('updatefound', handleUpdateFound)
    }).catch(() => {
      // PWA support is an enhancement; a registration failure must not block the app.
    })

    return () => {
      disposed = true
      installingWorker?.removeEventListener('statechange', handleStateChange)
      registration?.removeEventListener('updatefound', handleUpdateFound)
    }
  }, [enabled])

  const install = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }, [installPrompt])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    )
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    setWaitingWorker(null)
  }, [waitingWorker])

  const installMode = useMemo(() => {
    if (isInstallDismissed) return null
    if (installPrompt) return 'prompt'
    return canShowIosGuidance() ? 'ios' : null
  }, [installPrompt, isInstallDismissed])

  return {
    applyUpdate,
    dismissInstall: () => setIsInstallDismissed(true),
    dismissUpdate: () => setIsUpdateDismissed(true),
    install,
    installMode,
    isOnline,
    isUpdateReady: Boolean(waitingWorker && !isUpdateDismissed),
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  return navigator.serviceWorker.register('/service-worker.js', {
    scope: '/',
    updateViaCache: 'none',
  })
}

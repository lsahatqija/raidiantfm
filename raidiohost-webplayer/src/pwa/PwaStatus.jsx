import { usePwaLifecycle } from './usePwaLifecycle.js'
import './PwaStatus.css'

export function PwaStatusView({ lifecycle }) {
  return (
    <aside className="pwa-status-stack" aria-label="Application status">
      {!lifecycle.isOnline ? (
        <div className="pwa-status pwa-status--offline" role="status">
          <span aria-hidden="true">Offline</span>
          <p>Playback and fresh content need a connection. Cached app controls remain available.</p>
        </div>
      ) : null}

      {lifecycle.isUpdateReady ? (
        <div className="pwa-status" role="status">
          <p>An updated RaidiantFM is ready. Your current player will stay open until you choose to reload.</p>
          <div className="pwa-status-actions">
            <button type="button" onClick={lifecycle.applyUpdate}>Update now</button>
            <button type="button" className="pwa-status-secondary" onClick={lifecycle.dismissUpdate}>Later</button>
          </div>
        </div>
      ) : null}

      {lifecycle.installMode === 'prompt' ? (
        <div className="pwa-status" role="status">
          <p>Install RaidiantFM for a standalone player on this device.</p>
          <div className="pwa-status-actions">
            <button type="button" onClick={lifecycle.install}>Install RaidiantFM</button>
            <button type="button" className="pwa-status-secondary" onClick={lifecycle.dismissInstall}>Not now</button>
          </div>
        </div>
      ) : null}

      {lifecycle.installMode === 'ios' ? (
        <div className="pwa-status" role="status">
          <p>To install on iPhone or iPad, open Share and choose Add to Home Screen.</p>
          <button type="button" className="pwa-status-secondary" onClick={lifecycle.dismissInstall}>Got it</button>
        </div>
      ) : null}
    </aside>
  )
}

export function PwaStatus() {
  const lifecycle = usePwaLifecycle()
  return <PwaStatusView lifecycle={lifecycle} />
}

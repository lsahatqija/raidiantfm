import { useState } from 'react'
import { apiRequest } from './api/client'
import { exportUserStorage } from './utils/userStorage'

export function PrivacyControls({ onAccountDeleted, userId }) {
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  async function exportAccount() {
    setIsExporting(true)
    setError('')
    try {
      const serverData = await apiRequest('/api/users/me/export')
      const blob = new Blob([JSON.stringify({ ...serverData, browserState: exportUserStorage(userId) }, null, 2)], {
        type: 'application/json',
      })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = 'raidiantfm-account-export.json'
      link.click()
      URL.revokeObjectURL(href)
    } catch (requestError) {
      setError(requestError?.message || 'Unable to export your account right now.')
    } finally {
      setIsExporting(false)
    }
  }

  async function deleteAccount() {
    if (!window.confirm('Permanently delete your RaidiantFM account, preferences, sessions, and private topics?')) return
    setIsDeleting(true)
    setError('')
    try {
      await apiRequest('/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
      onAccountDeleted()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to delete your account right now.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <details className="privacy-controls">
      <summary>Privacy</summary>
      <div className="privacy-controls-panel">
        <button type="button" onClick={exportAccount} disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'Export my data'}
        </button>
        <button type="button" onClick={deleteAccount} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete account'}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  )
}

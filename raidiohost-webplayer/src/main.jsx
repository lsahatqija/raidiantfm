import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import { registerServiceWorker } from './pwa/registerServiceWorker.js'

if (import.meta.env.PROD) {
  void registerServiceWorker()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

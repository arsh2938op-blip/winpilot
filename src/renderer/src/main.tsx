import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { OrbApp } from './components/orb/OrbApp'
import './styles/globals.css'

// One bundle, two surfaces. The floating-orb BrowserWindow loads this same
// file with ?surface=orb and renders only the orb instead of the whole app,
// which is what keeps the companion on the app's own code, theme and
// preload bridge rather than a second copy of either.
const isOrbSurface = new URLSearchParams(window.location.search).get('surface') === 'orb'
if (isOrbSurface) document.documentElement.setAttribute('data-surface', 'orb')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* HashRouter, not BrowserRouter — Electron loads from a local file://
        path in production, and hash-based routing works there without any
        server configuration. */}
    <HashRouter>{isOrbSurface ? <OrbApp /> : <App />}</HashRouter>
  </React.StrictMode>
)
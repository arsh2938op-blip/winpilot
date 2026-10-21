import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Three independent build targets, matching Electron's process model:
//  - main:     Node.js process, the only place allowed to talk to Windows
//  - preload:  the "locked door" bridge exposed to the renderer via contextBridge
//  - renderer: the React UI, sandboxed, no direct system access

/**
 * The renderer's Content-Security-Policy, injected into index.html at build
 * time so dev and production can differ.
 *
 * Production is strict: the renderer ships no inline script and never calls
 * eval (there is no `eval(` or `new Function(` anywhere in src/renderer), so
 * `script-src 'self'` is enough. Everything that talks to the network goes
 * through IPC to the main process — the renderer itself makes no outbound
 * requests. `data:`/`blob:` are still needed for voice: TTS plays a base64
 * WAV and STT records a Blob.
 *
 * Dev keeps `unsafe-eval` and `unsafe-inline`, which Vite's HMR client and
 * React Fast Refresh require. They are never shipped.
 */
const CSP_PRODUCTION =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' ws: http: https:; " +
  // The MindCraft dashboard is embedded in a <webview> served by a local
  // MindCraft process, so the guest page needs its own allowance.
  "child-src 'self' http://localhost:*; " +
  "frame-src 'self' http://localhost:*; " +
  "object-src 'none'; " +
  "base-uri 'none'"

const CSP_DEVELOPMENT =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' ws: http: https:"

function cspPlugin(csp: string, apply: 'serve' | 'build'): Plugin {
  return {
    name: 'flame-csp',
    apply,
    transformIndexHtml(html) {
      return html.replace('__FLAME_CSP__', csp)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react(), cspPlugin(CSP_DEVELOPMENT, 'serve'), cspPlugin(CSP_PRODUCTION, 'build')]
  }
})

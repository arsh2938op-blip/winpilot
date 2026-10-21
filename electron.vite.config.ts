import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three independent build targets, matching Electron's process model:
//  - main:     Node.js process, the only place allowed to talk to Windows
//  - preload:  the "locked door" bridge exposed to the renderer via contextBridge
//  - renderer: the React UI, sandboxed, no direct system access
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
    plugins: [react()]
  }
})

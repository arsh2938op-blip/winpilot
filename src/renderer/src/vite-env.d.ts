/// <reference types="vite/client" />

import type { WinPilotApi } from '../../preload/index'

declare global {
  interface Window {
    api: WinPilotApi
  }
}

declare module '*.png' {
  const src: string
  export default src
}

export {}

import type { WinPilotApi } from './index'

declare global {
  interface Window {
    api: WinPilotApi
  }
}
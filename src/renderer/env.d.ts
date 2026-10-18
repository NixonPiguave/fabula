import type { DesktopApi } from '../shared/types'
declare global {
  interface Window {
    fabula?: DesktopApi
  }
}
export {}

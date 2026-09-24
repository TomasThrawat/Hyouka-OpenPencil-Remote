import { connectAutomation } from '@/app/automation/bridge/server'
import { getActiveStore } from '@/app/tabs'

let disconnect: (() => void) | null = null

export function startRemoteCanvasBridge(): void {
  if (!import.meta.env.PROD) return
  if (disconnect) return

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/api/mcp`

  disconnect = connectAutomation(getActiveStore, null, url).disconnect

  window.addEventListener(
    'beforeunload',
    () => {
      disconnect?.()
      disconnect = null
    },
    { once: true }
  )
}

import state from './_state'

export default function handler(req: any, res: any): void {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'GET required' }))
    return
  }

  const connected = Date.now() - state.lastBrowserSeen < 3000

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(
    JSON.stringify({
      bridge: connected ? 'connected' : 'waiting',
      queuedOperations: state.queue.length,
      pendingOperations: state.pending.size,
      lastBrowserSeen: state.lastBrowserSeen || null
    })
  )
}

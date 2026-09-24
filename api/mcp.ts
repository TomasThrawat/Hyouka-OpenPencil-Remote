import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerTools } from '@open-pencil/mcp'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
let browser: WebSocket | null = null

function sendRPC(body: Record<string, unknown>): Promise<unknown> {
  const socket = browser
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('OpenPencil browser editor is not connected'))
  }

  const id = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Browser automation request timed out'))
    }, 90_000)

    pending.set(id, { resolve, reject, timer })

    try {
      socket.send(JSON.stringify({ ...body, type: 'request', id }))
    } catch (error) {
      clearTimeout(timer)
      pending.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

const mcpHandler = createMcpHandler(() => {
  const server = new McpServer(
    { name: 'open-pencil-remote', version: '0.15.1' },
    { capabilities: { tools: {} } }
  )

  registerTools(server, {
    policy: {
      allowEval: false,
      disabledTools: []
    },
    mcpRoot: null,
    sendRPC
  })

  return server
})

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version'
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > 2 * 1024 * 1024) throw new Error('Request body too large')
    chunks.push(data)
  }

  return Buffer.concat(chunks)
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  if (!response.body) {
    res.end()
    return
  }

  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  } finally {
    res.end()
  }
}

const server = createServer(async (req, res) => {
  cors(res)

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    const connected = browser?.readyState === WebSocket.OPEN

    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        status: connected ? 'ok' : 'no_app',
        version: '0.15.1',
        authRequired: false,
        browserConnected: connected
      })
    )
    return
  }

  if (url.pathname !== '/api/mcp') {
    res.statusCode = 404
    res.end('Not found')
    return
  }

  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const headers = new Headers()

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value != null) headers.set(key, value)
    }

    const response = await mcpHandler.fetch(
      new Request(url, {
        method: req.method,
        headers,
        body: body && body.length > 0 ? body : undefined
      })
    )

    await writeResponse(res, response)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      })
    )
  }
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname !== '/api/mcp') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  if (browser && browser !== ws && browser.readyState === WebSocket.OPEN) {
    browser.close(1000, 'Replaced by a newer editor connection')
  }

  browser = ws

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>

      if (msg.type === 'register') return
      if (msg.type !== 'response' || typeof msg.id !== 'string') return

      const waiter = pending.get(msg.id)
      if (!waiter) return

      pending.delete(msg.id)
      clearTimeout(waiter.timer)

      const result = { ...msg }
      delete result.type
      delete result.id
      waiter.resolve(result)
    } catch (error) {
      console.warn('[OpenPencil Remote] Invalid browser message', error)
    }
  })

  ws.on('close', () => {
    if (browser === ws) browser = null

    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('OpenPencil browser editor disconnected'))
      pending.delete(id)
    }
  })

  ws.on('error', () => undefined)
})

export default server

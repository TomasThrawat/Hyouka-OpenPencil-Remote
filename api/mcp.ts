import { randomUUID } from 'node:crypto'

import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerTools } from '@open-pencil/mcp'

import state, { type RemoteOperation } from './_state.js'

const MCP_WAIT_TIMEOUT_MS = 50_000
const MAX_QUEUE_LENGTH = 64
const MAX_BODY_BYTES = 2 * 1024 * 1024

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version'
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

function sendRPC(body: Record<string, unknown>): Promise<unknown> {
  if (state.queue.length >= MAX_QUEUE_LENGTH) {
    return Promise.reject(new Error('OpenPencil remote bridge queue is full'))
  }

  const reqId = randomUUID()
  const operation: RemoteOperation = {
    reqId,
    command: typeof body.command === 'string' ? body.command : '',
    args: body.args
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(reqId)
      reject(
        new Error(
          'OpenPencil browser editor did not respond within 50 seconds. Keep the OpenPencil web editor open and try again.'
        )
      )
    }, MCP_WAIT_TIMEOUT_MS)

    state.pending.set(reqId, { resolve, reject, timer })
    state.queue.push(operation)
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

async function readBody(req: any): Promise<Buffer> {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body
    if (typeof req.body === 'string') return Buffer.from(req.body)
    return Buffer.from(JSON.stringify(req.body))
  }

  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large')
    chunks.push(data)
  }

  return Buffer.concat(chunks)
}

async function writeResponse(res: any, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}

export default async function handler(req: any, res: any): Promise<void> {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const headers = new Headers()

    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value != null) headers.set(key, String(value))
    }

    const request = new Request('https://openpencil-remote.invalid/api/mcp', {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined
    })

    const response = await mcpHandler.fetch(request)
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
}

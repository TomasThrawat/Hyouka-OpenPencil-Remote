import { randomUUID } from 'node:crypto'

import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerTools } from '@open-pencil/mcp'

import {
  OPENPENCIL_BRIDGE_KEY,
  supabaseRpc
} from './_supabase.js'

const MCP_WAIT_TIMEOUT_MS = 45_000
const OPERATION_POLL_INTERVAL_MS = 400
const MAX_BODY_BYTES = 2 * 1024 * 1024

type OperationState = {
  status: 'pending' | 'claimed' | 'completed' | 'missing'
  result?: unknown
  error?: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendRPC(body: Record<string, unknown>): Promise<unknown> {
  const reqId = randomUUID()
  const command = typeof body.command === 'string' ? body.command : ''
  const args = body.args ?? null

  await supabaseRpc('openpencil_enqueue_operation', {
    p_req_id: reqId,
    p_command: command,
    p_args: args,
    p_bridge_key: OPENPENCIL_BRIDGE_KEY
  })

  const deadline = Date.now() + MCP_WAIT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const state = await supabaseRpc<OperationState>(
      'openpencil_get_operation',
      {
        p_req_id: reqId,
        p_bridge_key: OPENPENCIL_BRIDGE_KEY
      }
    )

    if (state.status === 'completed') {
      if (state.error) {
        throw new Error(state.error)
      }
      return state.result
    }

    if (state.status === 'missing') {
      throw new Error('OpenPencil remote operation disappeared')
    }

    await sleep(OPERATION_POLL_INTERVAL_MS)
  }

  throw new Error(
    'OpenPencil browser editor did not respond within 45 seconds. Keep the OpenPencil web editor open and try again.'
  )
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
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large')
    }
    chunks.push(data)
  }

  return Buffer.concat(chunks)
}

async function writeResponse(res: any, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version'
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

export default async function handler(req: any, res: any): Promise<void> {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await readBody(req)

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(', '))
      } else if (value != null) {
        headers.set(key, String(value))
      }
    }

    const request = new Request(
      'https://openpencil-remote.invalid/api/mcp',
      {
        method: req.method,
        headers,
        body: body && body.length > 0 ? body : undefined
      }
    )

    await writeResponse(res, await mcpHandler.fetch(request))
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

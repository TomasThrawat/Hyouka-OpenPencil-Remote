import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerTools } from '@open-pencil/mcp'
import { sendHeadlessRPC } from './headless'

const MAX_BODY_BYTES = 2 * 1024 * 1024

const mcpHandler = (() => {
  const server = new McpServer(
    { name: 'open-pencil-remote', version: '0.15.1' },
    { capabilities: { tools: {} } },
  )

  registerTools(server, {
    policy: {
      allowEval: false,
      disabledTools: [],
    },
    mcpRoot: null,
    sendRPC: sendHeadlessRPC,
  })

  return createMcpHandler(() => server)
})()

function cors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

async function readBody(req: any): Promise<Buffer> {
  if (req.body !== undefined && req.body !== null) {
    return Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
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

async function writeResponse(res: any, response: Response) {
  res.statusCode = response.status

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value)
    }
  })

  const body = Buffer.from(await response.arrayBuffer())
  res.end(body)
}

export default async function handler(req: any, res: any) {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await readBody(req)

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value != null) headers.set(key, String(value))
    }

    const request = new Request(
      'https://openpencil-remote.invalid/api/mcp',
      {
        method: req.method,
        headers,
        body: body && body.length > 0 ? body : undefined,
      },
    )

    await writeResponse(res, await mcpHandler.fetch(request))
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}

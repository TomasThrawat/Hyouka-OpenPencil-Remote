import state from './_state'

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function readBody(req: any): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return JSON.parse(req.body)
    return req.body
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export default async function handler(req: any, res: any): Promise<void> {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'POST required' }))
    return
  }

  try {
    const body = await readBody(req)
    const reqId = typeof body?.reqId === 'string' ? body.reqId : ''

    if (!/^[a-f0-9-]{36}$/.test(reqId)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Invalid reqId' }))
      return
    }

    const pending = state.pending.get(reqId)
    if (!pending) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Pending request not found or expired' }))
      return
    }

    clearTimeout(pending.timer)
    state.pending.delete(reqId)
    pending.resolve({
      ok: body.ok !== false,
      result: body.result,
      error: typeof body.error === 'string' ? body.error : undefined
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      })
    )
  }
}

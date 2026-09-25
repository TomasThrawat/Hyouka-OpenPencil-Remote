import {
  OPENPENCIL_BRIDGE_KEY,
  supabaseRpc
} from './_supabase.js'

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

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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

    await supabaseRpc('openpencil_complete_operation', {
      p_req_id: reqId,
      p_ok: body.ok !== false,
      p_result: body.ok === false ? null : (body.result ?? null),
      p_error: body.ok === false ? (body.error ?? 'Unknown bridge error') : null,
      p_bridge_key: OPENPENCIL_BRIDGE_KEY
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
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

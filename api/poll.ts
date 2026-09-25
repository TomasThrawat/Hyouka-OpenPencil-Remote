import {
  OPENPENCIL_BRIDGE_KEY,
  supabaseRpc
} from './_supabase.js'

type RemoteOperation = {
  req_id: string
  command: string
  args?: unknown
}

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: any, res: any): Promise<void> {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'GET required' }))
    return
  }

  try {
    const rows = await supabaseRpc<RemoteOperation[]>(
      'openpencil_claim_operation',
      { p_bridge_key: OPENPENCIL_BRIDGE_KEY }
    )

    const operation = rows?.[0]
    if (!operation) {
      res.statusCode = 204
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(operation))
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

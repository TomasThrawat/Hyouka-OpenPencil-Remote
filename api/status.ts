import {
  OPENPENCIL_BRIDGE_KEY,
  supabaseRpc
} from './_supabase.js'

function cors(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: any, res: any): Promise<void> {
  cors(res)

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'GET required' }))
    return
  }

  try {
    const status = await supabaseRpc<Record<string, unknown>>(
      'openpencil_bridge_status',
      { p_bridge_key: OPENPENCIL_BRIDGE_KEY }
    )

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(status))
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

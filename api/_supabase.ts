const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
export const OPENPENCIL_BRIDGE_KEY = 'openpencil-remote-v1'

export async function supabaseRpc<T>(
  functionName: string,
  args: Record<string, unknown>
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'OpenPencil remote bridge is missing Supabase runtime configuration'
    )
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      cache: 'no-store',
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000)
    }
  )

  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed (${response.status}): ${body.slice(
        0,
        500
      )}`
    )
  }

  if (!body) {
    return undefined as T
  }

  return JSON.parse(body) as T
}

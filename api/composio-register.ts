const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1/custom/toolkits"
const REMOTE_MCP_URL = "https://hyouka-openpencil-remote-v2.vercel.app/api/mcp"

function json(res: any, status: number, body: unknown) {
  res.status(status)
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

async function post(path: string, apiKey: string, body: unknown) {
  const response = await fetch(`${COMPOSIO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let payload: unknown = text
  try {
    payload = JSON.parse(text)
  } catch {}

  return { response, payload }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return json(res, 405, { error: "Method not allowed" })
  }

  const apiKey = process.env.COMPOSIO_PROJECT_API_KEY
  if (!apiKey) {
    return json(res, 503, { error: "COMPOSIO_PROJECT_API_KEY is not configured" })
  }

  try {
    const upsert = await post("/upsert", apiKey, {
      slug: "HYOUKA_OPENPENCIL_REMOTE",
      toolkit_config: {
        name: "Hyouka OpenPencil Remote",
        app_url: REMOTE_MCP_URL,
        auth_schemes: [{ mode: "NO_AUTH" }],
      },
    })

    if (!upsert.response.ok) {
      return json(res, 502, {
        step: "upsert",
        status: upsert.response.status,
        response: upsert.payload,
      })
    }

    const slug =
      typeof upsert.payload === "object" &&
      upsert.payload !== null &&
      "slug" in upsert.payload &&
      typeof (upsert.payload as any).slug === "string"
        ? (upsert.payload as any).slug
        : "CUSTOM_HYOUKA_OPENPENCIL_REMOTE"

    const sync = await post("/sync", apiKey, { slug })

    if (!sync.response.ok) {
      return json(res, 502, {
        step: "sync",
        slug,
        status: sync.response.status,
        response: sync.payload,
      })
    }

    return json(res, 200, {
      ok: true,
      slug,
      upsert: upsert.payload,
      sync: sync.payload,
    })
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

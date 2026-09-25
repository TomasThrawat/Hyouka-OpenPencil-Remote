export default async function handler(_req: any, res: any) {
  try {
    const mod = await import('./mcp')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, exports: Object.keys(mod) }))
  } catch (error) {
    console.error('OpenPencil MCP import failure', error)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }))
  }
}

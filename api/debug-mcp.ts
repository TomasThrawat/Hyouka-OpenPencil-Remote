import mcpHandler from './mcp'

export default async function handler(_req: any, res: any) {
  try {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok: true,
      handlerType: typeof mcpHandler,
    }))
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

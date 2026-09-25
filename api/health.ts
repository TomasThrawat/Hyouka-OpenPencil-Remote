export default function handler(req: any, res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({
    ok: true,
    mode: 'headless',
    version: '0.15.1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    expected: typeof req?.query?.expected === 'string' ? req.query.expected : null,
  }))
}

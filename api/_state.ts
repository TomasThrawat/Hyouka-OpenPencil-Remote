export type RemoteOperation = {
  reqId: string
  command: string
  args?: unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type RemoteMCPState = {
  queue: RemoteOperation[]
  pending: Map<string, PendingRequest>
  seq: number
  lastBrowserSeen: number
}

declare global {
  var __OPENPENCIL_REMOTE_MCP_STATE__: RemoteMCPState | undefined
}

const state: RemoteMCPState =
  globalThis.__OPENPENCIL_REMOTE_MCP_STATE__ ?? {
    queue: [] as RemoteOperation[],
    pending: new Map<string, PendingRequest>(),
    seq: 0,
    lastBrowserSeen: 0
  }

globalThis.__OPENPENCIL_REMOTE_MCP_STATE__ = state

export default state

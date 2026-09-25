let active = false
let pollTimer: ReturnType<typeof setTimeout> | null = null
let stopped = false
let inFlight = false
let loadingHandlers: Promise<{
  handleRequest: (
    store: unknown,
    command: string,
    args: unknown
  ) => Promise<unknown>
  getActiveStore: () => unknown
}> | null = null

const POLL_INTERVAL_MS = 750
const REQUEST_TIMEOUT_MS = 20_000

function clearPollTimer(): void {
  if (!pollTimer) return
  clearTimeout(pollTimer)
  pollTimer = null
}

function schedulePoll(delayMs = POLL_INTERVAL_MS): void {
  if (stopped || pollTimer) return
  pollTimer = setTimeout(() => {
    pollTimer = null
    void poll()
  }, delayMs)
}

async function loadHandlers(): Promise<{
  handleRequest: (
    store: unknown,
    command: string,
    args: unknown
  ) => Promise<unknown>
  getActiveStore: () => unknown
}> {
  if (!loadingHandlers) {
    loadingHandlers = Promise.all([
      import('@/app/automation/bridge/figma-factory'),
      import('@/app/automation/bridge/handlers'),
      import('@/app/tabs')
    ]).then(([figmaFactory, handlers, tabs]) => {
      const { handleRequest } = handlers.createAutomationCommandHandlers(
        figmaFactory.makeFigmaFromStore
      )
      return {
        handleRequest,
        getActiveStore: tabs.getActiveStore
      }
    })
  }
  return loadingHandlers
}

async function sendReply(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      keepalive: true
    })
  } catch (error) {
    console.warn('[OpenPencil Remote] Failed to send bridge response', error)
  }
}

async function executeOperation(operation: {
  reqId: string
  command: string
  args?: unknown
}): Promise<void> {
  try {
    const { handleRequest, getActiveStore } = await loadHandlers()
    const result = await handleRequest(
      getActiveStore(),
      operation.command,
      operation.args
    )
    await sendReply({ reqId: operation.reqId, ok: true, result })
  } catch (error) {
    await sendReply({
      reqId: operation.reqId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function poll(): Promise<void> {
  if (stopped || inFlight) return
  inFlight = true

  try {
    const response = await fetch('/api/poll', {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' }
    })

    if (response.status === 200) {
      const operation = (await response.json()) as {
        reqId?: unknown
        command?: unknown
        args?: unknown
      }

      if (
        typeof operation.reqId === 'string' &&
        typeof operation.command === 'string'
      ) {
        await executeOperation({
          reqId: operation.reqId,
          command: operation.command,
          args: operation.args
        })
      }
    } else if (response.status !== 204) {
      console.warn('[OpenPencil Remote] Bridge poll failed', response.status)
    }
  } catch (error) {
    if (!stopped) {
      console.warn(
        '[OpenPencil Remote] Bridge poll error',
        error instanceof Error ? error.message : String(error)
      )
    }
  } finally {
    inFlight = false
    schedulePoll()
  }
}

export function startRemoteCanvasBridge(): void {
  if (typeof window === 'undefined' || active) return
  active = true
  stopped = false
  void poll()

  window.addEventListener(
    'beforeunload',
    () => {
      stopped = true
      active = false
      clearPollTimer()
    },
    { once: true }
  )
}

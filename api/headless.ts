import { randomUUID } from 'node:crypto'
import { createEditor, executeAtomicTool, type Editor } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, isAtomicTool, type ToolDef } from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

type HeadlessDocument = {
  id: string
  name: string
  path?: string
  editor: Editor
  lock: Promise<void>
}

type RpcBody = {
  command?: string
  args?: Record<string, unknown> & {
    document_id?: string
    page_id?: string
  }
}

const documents = new Map<string, HeadlessDocument>()
let activeDocumentId: string | null = null

function makeDocument(name = 'OpenPencil Remote', path?: string) {
  const graph = new SceneGraph()
  const editor = createEditor({
    graph,
    getViewportSize: () => ({ width: 1280, height: 720 }),
  })

  const doc: HeadlessDocument = {
    id: randomUUID(),
    name,
    ...(path ? { path } : {}),
    editor,
    lock: Promise.resolve(),
  }

  documents.set(doc.id, doc)
  if (!activeDocumentId) activeDocumentId = doc.id
  return doc
}

function getActiveDocument() {
  if (activeDocumentId) {
    const active = documents.get(activeDocumentId)
    if (active) return active
  }
  return makeDocument()
}

function getDocument(id?: string) {
  if (id) {
    const doc = documents.get(id)
    if (!doc) throw new Error(`Document "${id}" not found`)
    return doc
  }
  return getActiveDocument()
}

function getPage(editor: Editor, pageId?: string) {
  const requested = pageId ? editor.graph.getNode(pageId) : undefined
  const fallback = editor.graph.getPages()[0]
  const page = requested ?? fallback
  if (!page || page.type !== 'CANVAS') {
    throw new Error(`Page "${pageId ?? '(default)'}" not found`)
  }
  return page
}

function createFigmaAPI(editor: Editor, pageId?: string) {
  const figma = new FigmaAPI(editor.graph)
  const page = getPage(editor, pageId)
  figma.currentPage = figma.wrapNode(page.id)
  figma.currentPage.selection = []
  return { figma, page }
}

function documentSummary(doc: HeadlessDocument) {
  const pages = doc.editor.graph.getPages().map((page) => ({
    id: page.id,
    name: page.name,
  }))
  const current = pages[0]
  return {
    id: doc.id,
    name: doc.name,
    ...(doc.path ? { path: doc.path } : {}),
    active: doc.id === activeDocumentId,
    current_page_id: current?.id,
    current_page_name: current?.name,
    pages,
  }
}

async function executeTool(
  doc: HeadlessDocument,
  name: string,
  args: Record<string, unknown>,
  pageId?: string,
) {
  const def = ALL_TOOLS.find((tool) => tool.name === name) as ToolDef | undefined
  if (!def) throw new Error(`Unknown OpenPencil tool "${name}"`)

  const { figma, page } = createFigmaAPI(doc.editor, pageId)

  if (isAtomicTool(def)) {
    return executeAtomicTool(doc.editor, figma, def, args, { label: name })
  }

  if (def.mutates) {
    return await doc.editor.runMutationWithLayout(
      () => def.execute(figma, args),
      page.id,
    )
  }

  return await def.execute(figma, args)
}

async function withDocumentLock<T>(doc: HeadlessDocument, fn: () => Promise<T>): Promise<T> {
  const previous = doc.lock
  let release!: () => void
  doc.lock = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

export async function sendHeadlessRPC(body: RpcBody) {
  const command = body.command
  const args = body.args ?? {}

  if (!command) throw new Error('Missing RPC command')

  if (command === 'list_documents') {
    if (documents.size === 0) makeDocument()
    return {
      ok: true,
      result: Array.from(documents.values()).map(documentSummary),
    }
  }

  if (command === 'new_document') {
    const name = typeof args.name === 'string' && args.name.trim()
      ? args.name.trim()
      : 'OpenPencil Remote'
    const path = typeof args.path === 'string' && args.path.trim()
      ? args.path.trim()
      : undefined
    const doc = makeDocument(name, path)
    activeDocumentId = doc.id
    return {
      ok: true,
      result: { created: true },
      target: documentSummary(doc),
    }
  }

  if (command === 'close_file') {
    const doc = getDocument(typeof args.document_id === 'string' ? args.document_id : undefined)
    const pageId = typeof args.page_id === 'string' ? args.page_id : undefined
    const page = getPage(doc.editor, pageId)
    const target = {
      documentId: doc.id,
      documentName: doc.name,
      pageId: page.id,
      pageName: page.name,
    }

    return withDocumentLock(doc, async () => {
      documents.delete(doc.id)
      if (activeDocumentId === doc.id) {
        activeDocumentId = documents.keys().next().value ?? null
      }
      doc.editor.dispose()
      if (!activeDocumentId) makeDocument()
      return {
        ok: true,
        result: { closed: true },
        target,
      }
    })
  }

  if (command === 'open_file' || command === 'save_file') {
    throw new Error(
      `${command} is not available in the browser-free Vercel runtime. Use new_document and the document editing tools instead.`,
    )
  }

  if (command === 'tool') {
    const name = typeof args.name === 'string' ? args.name : ''
    const toolArgs = args.args && typeof args.args === 'object'
      ? args.args as Record<string, unknown>
      : {}
    const documentId = typeof args.document_id === 'string' ? args.document_id : undefined
    const pageId = typeof args.page_id === 'string' ? args.page_id : undefined
    const doc = getDocument(documentId)

    return withDocumentLock(doc, async () => {
      const result = await executeTool(doc, name, toolArgs, pageId)
      return {
        ok: true,
        result,
        target: {
          documentId: doc.id,
          documentName: doc.name,
          pageId: getPage(doc.editor, pageId).id,
          pageName: getPage(doc.editor, pageId).name,
        },
      }
    })
  }

  throw new Error(`Unknown RPC command "${command}"`)
}

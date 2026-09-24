import * as v from 'valibot'

import type { FigmaAPI } from '#core/figma-api'
import {
  getPluginData,
  setPluginData
} from '#core/figma-api/plugin-data'
import type { SceneNode } from '@open-pencil/scene-graph'
import { defineTool, nodeSummary } from '#core/tools/schema'

const CODE_CONNECT_KEY = 'code-connect-map'
const CODE_CONNECT_VERSION = 1 as const

interface CodeConnectMapping {
  componentName: string
  source: string
  snippet?: string
  imports?: string[]
  framework?: string
  language?: string
  label?: string
}

interface CodeConnectStore {
  version: typeof CODE_CONNECT_VERSION
  mappings: Record<string, CodeConnectMapping>
}

function mappingKey(mapping: Pick<CodeConnectMapping, 'label' | 'framework' | 'language'>): string {
  return JSON.stringify([mapping.label ?? '', mapping.framework ?? '', mapping.language ?? ''])
}

function emptyStore(): CodeConnectStore {
  return { version: CODE_CONNECT_VERSION, mappings: {} }
}

function readStore(node: SceneNode): CodeConnectStore {
  const raw = getPluginData(node, CODE_CONNECT_KEY)
  if (!raw) return emptyStore()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyStore()

    const candidate = parsed as Partial<CodeConnectStore>
    if (candidate.version !== CODE_CONNECT_VERSION || !candidate.mappings) return emptyStore()
    if (typeof candidate.mappings !== 'object' || Array.isArray(candidate.mappings)) return emptyStore()

    return {
      version: CODE_CONNECT_VERSION,
      mappings: candidate.mappings as Record<string, CodeConnectMapping>
    }
  } catch {
    return emptyStore()
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function requireConnectableNode(figma: FigmaAPI, id: string): SceneNode {
  const node = figma.graph.getNode(id)
  if (!node) throw new Error(`Node "${id}" not found`)
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error('Code Connect mappings require a COMPONENT or COMPONENT_SET node')
  }
  return node
}

const connectFields = {
  component_name: v.pipe(v.string(), v.minLength(1), v.description('Code component name')),
  source: v.pipe(v.string(), v.minLength(1), v.description('Code source path or URL')),
  snippet: v.optional(v.pipe(v.string(), v.description('Example code usage snippet'))),
  imports: v.optional(v.array(v.string()), []),
  framework: v.optional(v.pipe(v.string(), v.description('Framework label, for example React'))),
  language: v.optional(v.pipe(v.string(), v.description('Code language, for example TypeScript'))),
  label: v.optional(v.pipe(v.string(), v.description('Mapping label, for example React web')))
}

export const addCodeConnectMap = defineTool({
  name: 'add_code_connect_map',
  description:
    'Map a reusable OpenPencil component or component set to its real code implementation. The mapping is persisted in the document and can include framework, language, imports, and a usage snippet.',
  execution: { kind: 'sync', mutation: 'document' },
  input: v.object({
    node_id: v.pipe(v.string(), v.minLength(1), v.description('Component or component set node ID')),
    ...connectFields
  }),
  execute: (figma, args) => {
    const node = requireConnectableNode(figma, args.node_id)
    const mapping: CodeConnectMapping = {
      componentName: args.component_name.trim(),
      source: args.source.trim(),
      snippet: normalizeOptional(args.snippet),
      imports: args.imports?.map((item) => item.trim()).filter(Boolean),
      framework: normalizeOptional(args.framework),
      language: normalizeOptional(args.language),
      label: normalizeOptional(args.label)
    }

    const store = readStore(node)
    store.mappings[mappingKey(mapping)] = mapping
    setPluginData(figma.graph, node, CODE_CONNECT_KEY, JSON.stringify(store))

    return {
      node: nodeSummary(figma.getNodeById(node.id)!),
      mapping,
      mappings: Object.values(store.mappings)
    }
  }
})

export const getCodeConnectMap = defineTool({
  name: 'get_code_connect_map',
  description:
    'Read persisted Code Connect mappings. Pass node IDs to inspect specific components, or omit them to scan component and component-set nodes on the current page.',
  execution: { kind: 'sync', mutation: 'none' },
  input: v.object({
    node_ids: v.optional(v.array(v.string())),
    limit: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.description('Maximum number of nodes to inspect'))
    )
  }),
  execute: (figma, args) => {
    const limit = args.limit ?? 100
    const requested = args.node_ids?.filter(Boolean) ?? []
    const nodeIds =
      requested.length > 0
        ? [...new Set(requested)].slice(0, limit)
        : figma.currentPage
            .findAll((node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')
            .map((node) => node.id)
            .slice(0, limit)

    const results = nodeIds.flatMap((id) => {
      const node = figma.graph.getNode(id)
      if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) return []
      const mappings = Object.values(readStore(node))
      if (mappings.length === 0) return []
      return [{ node: { id: node.id, name: node.name, type: node.type }, mappings }]
    })

    return {
      count: results.length,
      mappings: results
    }
  }
})

export const removeCodeConnectMap = defineTool({
  name: 'remove_code_connect_map',
  description:
    'Remove all Code Connect mappings for a component, or remove only mappings matching a label, framework, or language.',
  execution: { kind: 'sync', mutation: 'document' },
  input: v.object({
    node_id: v.pipe(v.string(), v.minLength(1), v.description('Component or component set node ID')),
    label: v.optional(v.string()),
    framework: v.optional(v.string()),
    language: v.optional(v.string())
  }),
  execute: (figma, args) => {
    const node = requireConnectableNode(figma, args.node_id)
    const label = normalizeOptional(args.label)
    const framework = normalizeOptional(args.framework)
    const language = normalizeOptional(args.language)
    const store = readStore(node)

    const shouldRemove = (mapping: CodeConnectMapping) =>
      (label === undefined || mapping.label === label) &&
      (framework === undefined || mapping.framework === framework) &&
      (language === undefined || mapping.language === language)

    const before = Object.keys(store.mappings).length
    for (const [key, mapping] of Object.entries(store.mappings)) {
      if (shouldRemove(mapping)) delete store.mappings[key]
    }
    const removed = before - Object.keys(store.mappings).length

    if (removed > 0) {
      setPluginData(figma.graph, node, CODE_CONNECT_KEY, JSON.stringify(store))
    }

    return {
      node: nodeSummary(figma.getNodeById(node.id)!),
      removed,
      remaining: Object.values(store.mappings)
    }
  }
})

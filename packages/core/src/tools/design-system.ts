import * as v from 'valibot'

import { getComponents } from '#core/tools/read/components'
import { defineTool } from '#core/tools/schema'

type SearchKind = 'components' | 'variables'

interface SearchResult {
  kind: SearchKind
  id: string
  name: string
  score: number
  [key: string]: unknown
}

function scoreName(name: string, query: string): number {
  const candidate = name.toLowerCase()
  const needle = query.trim().toLowerCase()
  if (!needle || !candidate.includes(needle)) return 0
  if (candidate === needle) return 100
  if (candidate.startsWith(needle)) return 80
  return 50
}

function mergeResults(results: SearchResult[], limit: number): SearchResult[] {
  const best = new Map<string, SearchResult>()
  for (const result of results) {
    const key = `${result.kind}:${result.id}`
    const previous = best.get(key)
    if (!previous || result.score > previous.score) best.set(key, result)
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export const searchDesignSystem = defineTool({
  name: 'search_design_system',
  description:
    'Search the current OpenPencil design system in one call. Finds reusable document/library components and local variables across multiple search intents, ranked by name relevance.',
  execution: { kind: 'sync', mutation: 'none' },
  input: v.object({
    queries: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1),
      v.description('One or more independent design-system search intents')
    ),
    include: v.optional(
      v.pipe(v.picklist(['all', 'components', 'variables']), v.description('Result categories to search')),
      'all'
    ),
    limit: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.description('Maximum combined results')),
      50
    )
  }),
  execute: async (figma, args) => {
    const results: SearchResult[] = []

    if (args.include !== 'variables') {
      for (const query of args.queries) {
        const response = await getComponents.execute(figma, { name: query, source: 'all', limit: args.limit })
        for (const component of response.components) {
          results.push({
            kind: 'components',
            id:
              component.source === 'library'
                ? `${component.libraryId}:${component.assetKey}`
                : component.id,
            name: component.name,
            score: scoreName(component.name, query),
            ...component
          })
        }
      }
    }

    if (args.include !== 'components') {
      const variables = figma.getLocalVariables()
      for (const query of args.queries) {
        for (const variable of variables) {
          const score = scoreName(variable.name, query)
          if (!score) continue
          results.push({
            kind: 'variables',
            id: variable.id,
            name: variable.name,
            score,
            type: variable.type,
            collectionId: variable.collectionId,
            description: variable.description
          })
        }
      }
    }

    const merged = mergeResults(results, args.limit)
    return {
      count: merged.length,
      results: merged,
      queries: [...args.queries]
    }
  }
})

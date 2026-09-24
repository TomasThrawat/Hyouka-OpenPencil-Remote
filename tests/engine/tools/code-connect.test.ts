import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import {
  addCodeConnectMap,
  getCodeConnectMap,
  removeCodeConnectMap
} from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

describe('Code Connect tools', () => {
  test('persists, reads, filters, and removes mappings on components', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    if (!page) throw new Error('Expected default page')

    const component = graph.createNode('COMPONENT', page.id, { name: 'Button' })
    const figma = new FigmaAPI(graph)
    figma.currentPage = figma.wrapNode(page.id)

    expect(
      addCodeConnectMap.execute(figma, {
        node_id: component.id,
        component_name: 'Button',
        source: 'src/components/Button.tsx',
        framework: 'React',
        language: 'TypeScript',
        label: 'React',
        imports: ['import { Button } from "./components/Button"'],
        snippet: '<Button variant="primary" />'
      })
    ).toMatchObject({
      mapping: {
        componentName: 'Button',
        source: 'src/components/Button.tsx',
        framework: 'React',
        language: 'TypeScript',
        label: 'React'
      }
    })

    expect(
      addCodeConnectMap.execute(figma, {
        node_id: component.id,
        component_name: 'Button',
        source: 'Sources/Button.swift',
        framework: 'SwiftUI',
        language: 'Swift',
        label: 'SwiftUI'
      })
    ).toMatchObject({
      mapping: {
        framework: 'SwiftUI',
        language: 'Swift',
        label: 'SwiftUI'
      }
    })

    expect(getCodeConnectMap.execute(figma, { node_ids: [component.id] })).toMatchObject({
      count: 1,
      mappings: [
        {
          node: { name: 'Button', type: 'COMPONENT' },
          mappings: [{ framework: 'React', label: 'React' }, { framework: 'SwiftUI', label: 'SwiftUI' }]
        }
      ]
    })

    expect(
      removeCodeConnectMap.execute(figma, {
        node_id: component.id,
        framework: 'React'
      })
    ).toMatchObject({
      removed: 1,
      remaining: [{ framework: 'SwiftUI', label: 'SwiftUI' }]
    })
  })
})

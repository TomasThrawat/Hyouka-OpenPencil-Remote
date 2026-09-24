import process from 'node:process'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

import { ensureBrandAssets } from '@open-pencil/brand-tools'

import packageJson from './package.json'
import { viteBuildTarget } from './src/app/shell/support/baseline'
import { createOpenPencilAliases } from './vite/aliases'
import { copyCanvasKitAssetsPlugin } from './vite/canvaskit-assets'
import { openPencilPwaPlugin } from './vite/pwa'
import { rawMarkdownPlugin } from './vite/raw-markdown'
import { createDevServerOptions } from './vite/server'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async ({ command }) => {
  await ensureBrandAssets(['web'])

  let automationRoute = { browserURL: '' }
  let automationToken: string | null = null
  let automationPlugin: import('vite').Plugin | null = null

  if (command === 'serve') {
    const {
      localAutomationRoute,
      localAutomationToken,
      openPencilAutomationPlugin
    } = await import('./vite/automation')
    automationRoute = localAutomationRoute(host)
    automationToken = localAutomationToken(command)
    automationPlugin = openPencilAutomationPlugin(command, host)
  }
  return {
    resolve: {
      alias: createOpenPencilAliases(__dirname)
    },
    define: {
      __OPENPENCIL_APP_VERSION__: JSON.stringify(packageJson.version),
      __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__: JSON.stringify(automationToken),
      __OPENPENCIL_LOCAL_AUTOMATION_URL__: JSON.stringify(automationRoute.browserURL),
      __OPENPENCIL_LOCAL_AUTOMATION_HTTP_URL__: JSON.stringify(
        automationRoute.browserURL.replace(/^ws/, 'http')
      )
    },
    plugins: [
      rawMarkdownPlugin(),
      copyCanvasKitAssetsPlugin(),
      tailwindcss(),
      Icons({ compiler: 'vue3' }),
      Components({ resolvers: [IconsResolver({ prefix: 'icon' })] }),
      ...(automationPlugin ? [automationPlugin] : []),
      vue(),
      openPencilPwaPlugin()
    ],
    clearScreen: false,
    build: {
      // Syntax is lowered to the supported browser baseline; APIs are not polyfilled.
      target: viteBuildTarget(),
      rolldownOptions: {
        external: ['@open-pencil/mcp', '@modelcontextprotocol/server', 'ws']
      },
      chunkSizeWarningLimit: 2500
    },
    server: createDevServerOptions(host, __dirname)
  }
})

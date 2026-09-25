import { createHead } from '@unhead/vue/client'
import { createApp, nextTick } from 'vue'

import { createRetainedScopePlugin } from '@open-pencil/vue'

import './app.css'
import { preloadFonts } from '@/app/editor/fonts'
import { observeBootErrors } from '@/app/shell/support/boot'
import { reportBootFailure } from '@/app/shell/support/gate'
import { IS_TAURI } from '@/constants'

import App from './App.vue'
import router from './router'

/**
 * Application entry, loaded by `main.ts` only after the support gate passes.
 * The remote MCP bridge is started before the support gate failure return so
 * a web editor can remain remotely controllable even when a non-fatal support
 * diagnostic blocks the rest of boot.
 */
export async function boot(): Promise<void> {
  preloadFonts()
  const head = createHead()
  const app = createApp(App)
  const bootErrors = observeBootErrors(app)
  app.use(router).use(head).use(createRetainedScopePlugin()).mount('#app')

  // The web deployment owns the remote MCP bridge. Start it immediately
  // after mount so support-gate failures cannot leave the editor unconnected.
  if (!IS_TAURI && import.meta.env.PROD) {
    void import('./remote-mcp')
      .then(({ startRemoteCanvasBridge }) => startRemoteCanvasBridge())
      .catch((error) => {
        console.warn('[OpenPencil Remote] Bridge startup failed', error)
      })
  }

  await router.isReady()
  await nextTick()

  const failure = bootErrors.stop()
  if (failure) {
    await reportBootFailure(failure.error)
    return
  }

  if (!IS_TAURI) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
      return undefined
    })
  }
}

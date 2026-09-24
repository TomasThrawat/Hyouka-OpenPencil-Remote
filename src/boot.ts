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
 * Keeping it behind a dynamic import means an unsupported engine never
 * evaluates the app bundle and can still show the gate's guidance.
 */
export async function boot(): Promise<void> {
  preloadFonts()
  const head = createHead()
  const app = createApp(App)
  const bootErrors = observeBootErrors(app)
  app.use(router).use(head).use(createRetainedScopePlugin()).mount('#app')

  await router.isReady()
  await nextTick()

  const failure = bootErrors.stop()
  if (failure) {
    await reportBootFailure(failure.error)
    return
  }

  // The web deployment owns the remote MCP bridge. Do not gate this behind a
  // VITE_* build variable: when that variable is absent during CI, Vite can
  // constant-fold the import away and silently ship an editor with no bridge.
  if (!IS_TAURI && import.meta.env.PROD) {
    void import('./remote-mcp')
      .then(({ startRemoteCanvasBridge }) => startRemoteCanvasBridge())
      .catch((error) => {
        console.warn('[OpenPencil Remote] Bridge startup failed', error)
      })
  }

  if (!IS_TAURI) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
      return undefined
    })
  }
}

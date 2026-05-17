/**
 * BOYO — background bundle entry point.
 *
 * Responsibilities:
 *   - Initialize ApiClient (reads server URL from browser.storage.local)
 *   - Register the message handler (content ↔ background protocol)
 *   - Clear any stale browser.storage session keys on startup
 *
 * Runtime isolation: no imports from src/content/ or src/popup/ at runtime.
 * Type imports from src/types/ are erased — safe.
 */
import { ApiClient, createMessageHandler } from "@censor/lib/background"

async function init(): Promise<void> {
  const api = new ApiClient()
  await api.init()

  console.log(`[BOYO Background] initialized — API at ${api.config.baseUrl}`)

  browser.runtime.onMessage.addListener(createMessageHandler(api))
}

init().catch((err) => console.error("[BOYO Background] init failed:", err))

export {}

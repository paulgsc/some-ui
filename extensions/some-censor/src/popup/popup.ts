/**
 * Popup (`popup.html`) — the entry point the manifest's `default_popup` has
 * promised since before any file existed at that path (see vite.config.ts's
 * note on #1396's non-goals). This adds only the "Diagnostics" entry point,
 * per Charter idiom #3: `@some-extension/common`'s `diagnosticsLink` is the
 * same link some-filter's and suspender-ledger's popups already end with.
 * The whitelist/enabled controls `@censor/types/messages` already models
 * (`GET_ENABLED`, `SET_ENABLED`, `GET_WHITELIST`) are a separate,
 * not-yet-built surface — out of scope here.
 */
import { ext } from "@censor/platform/content"
import { diagnosticsLink } from "@some-extension/common/lib/diagnostics"

import "./popup.css"

function render(): void {
  const root = document.getElementById("app")
  if (!root) return

  root.appendChild(
    diagnosticsLink({
      href: ext.runtime.getURL("debug.html"),
      tooltip: "Card resolution health, metrics and the masking event timeline",
    })
  )
}

render()

/**
 * Popup (`popup.html`) — the manifest's `default_popup`. Content is a header
 * (brand mark + name, the manifest's own `assets/icon-*.png`) and the
 * "Diagnostics" entry point per Charter idiom #3:
 * `@some-extension/common`'s `diagnosticsLink` is the same link some-filter's
 * and suspender-ledger's popups already end with. The whitelist/enabled
 * controls `@censor/types/messages` already models (`GET_ENABLED`,
 * `SET_ENABLED`, `GET_WHITELIST`) are a separate, not-yet-built surface —
 * out of scope here.
 */
import { ext } from "@censor/platform/content"
import { diagnosticsLink } from "@some-extension/common/lib/diagnostics"

import "./popup.css"

function header(): HTMLElement {
  const el = document.createElement("header")
  el.className = "popup__header"

  const logo = document.createElement("img")
  logo.className = "popup__logo"
  logo.src = ext.runtime.getURL("assets/icon-48.png")
  logo.alt = ""
  logo.width = 20
  logo.height = 20

  const title = document.createElement("span")
  title.className = "popup__title"
  title.textContent = "BOYO"

  el.append(logo, title)
  return el
}

function tagline(): HTMLElement {
  const p = document.createElement("p")
  p.className = "popup__tagline"
  p.textContent = "Progressive content masking with intentional disclosure"
  return p
}

function render(): void {
  const root = document.getElementById("app")
  if (!root) return

  root.append(
    header(),
    tagline(),
    diagnosticsLink({
      href: ext.runtime.getURL("debug.html"),
      tooltip: "Card resolution health, metrics and the masking event timeline",
    })
  )
}

render()

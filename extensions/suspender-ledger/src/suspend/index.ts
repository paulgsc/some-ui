// Copyright (c) 2026 paulgsc — MIT License
//
// Suspend page controller. Original work — this owned page is the project's
// core user story (#258): theme-aware, anti-flash-bang, and in full control of
// the restore interaction.
//
// Restore model: the page is handed the original address as a `url` parameter
// and navigates the tab back with `location.replace(url)` — no history entry,
// no dependency on a worker round-trip. When the address is missing or invalid
// the page enters a self-explanatory recovery state rather than stranding the
// user on a dead tab.

import { isRestorableUrl } from "@suspender/lib/safe-url"
import { SuspendCard } from "@suspender/suspend/components/suspend-card"
import {
  parseSuspendParams,
  type SuspendParams,
} from "@suspender/suspend/params"

import "./suspend.css"

/**
 * The suspended-state favicon. An inline SVG (no network, no file dependency)
 * showing a "Z" sleep glyph on the filter's dark canvas. It deliberately
 * replaces the original site's favicon: a moz-extension page that serves another
 * origin's exact icon reads as phishing scaffolding to AMO's classifier (#317),
 * and it stops the real tab and its suspended twin from looking identical in the
 * tab strip.
 */
const SUSPENDED_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="5" fill="#0d1117"/><g fill="none" stroke="#7aa2f7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h6l-6 8h6"/><path d="M14 5h5l-5 6h5" opacity="0.55"/></g></svg>`
const SUSPENDED_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  SUSPENDED_FAVICON_SVG
)}`

/**
 * Reflect the suspended state onto the tab strip. The title carries the marker
 * prefix that `buildSuspendUrl` guarantees (never the verbatim original), and
 * the favicon is our own suspended badge — never the original site's icon.
 */
function applyTabChrome(params: SuspendParams): void {
  const label = params.title || hostOf(params.url)
  if (label) {
    document.title = label
  }
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  link.href = SUSPENDED_FAVICON
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

function main(): void {
  const root = document.getElementById("app")
  if (!root) return

  const params = parseSuspendParams(location.search, location.hash)
  const recovery = !isRestorableUrl(params.url)

  if (!recovery) {
    applyTabChrome(params)
  }

  const restore = (): void => {
    // Validate scheme inline so static analysis can follow the guard directly.
    if (!isRestorableUrl(params.url)) return
    // Replace (not assign) so the suspended page leaves no back-button trap.
    location.replace(params.url)
  }

  root.replaceChildren(
    SuspendCard({
      title: params.title,
      url: params.url,
      recovery,
      onRestore: restore,
    })
  )

  if (recovery) return

  // Keyboard shortcut mirrors the explicit button for power users.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      restore()
    }
  })
}

main()

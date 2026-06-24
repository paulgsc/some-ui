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

import { isRestorableUrl, isSafeFaviconUrl } from "@suspender/lib/safe-url"
import { SuspendCard } from "@suspender/suspend/components/suspend-card"

import "./suspend.css"

/** Decoded parameters describing the tab that was suspended. */
type SuspendParams = {
  url: string
  title: string
  favIconUrl: string
}

/**
 * Read suspend parameters from the page address. Both the query string and the
 * hash are checked: the hash form lets the worker update the marker without the
 * browser treating it as a fresh navigation.
 */
function readParams(): SuspendParams {
  const fromSearch = new URLSearchParams(location.search)
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, ""))
  const pick = (key: string): string =>
    fromSearch.get(key) ?? fromHash.get(key) ?? ""
  return {
    url: pick("url"),
    title: pick("title"),
    favIconUrl: pick("favicon"),
  }
}

/** Reflect the original title/favicon onto the tab strip while suspended. */
function applyTabChrome(params: SuspendParams): void {
  const label = params.title || hostOf(params.url)
  if (label) {
    document.title = label
  }
  if (params.favIconUrl && isSafeFaviconUrl(params.favIconUrl)) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.href = params.favIconUrl
  }
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

  const params = readParams()
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
      favIconUrl: params.favIconUrl || undefined,
      recovery,
      onRestore: restore,
    })
  )

  if (recovery) return

  // The whole page is a restore target — click or keyboard.
  document.body.addEventListener("click", restore)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      restore()
    }
  })
}

main()

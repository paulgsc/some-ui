// Copyright (c) 2026 paulgsc — MIT License
//
// Original work (not ported): the owned suspend page is the whole reason this
// extension exists, so it carries no upstream MPL lineage.

/** Presentational model for the suspended-tab card. */
export type SuspendCardProps = {
  /** Original page title (falls back to the host, then a placeholder). */
  title: string
  /** Original page URL, shown as a subdued breadcrumb. Empty in recovery mode. */
  url: string
  /** Favicon URL; omitted/broken renders the sleep glyph instead. */
  favIconUrl?: string
  /**
   * Recovery mode: the page was opened without a usable `url` param, so there
   * is nothing to restore. The card explains this and offers no restore action.
   */
  recovery: boolean
  /** Invoked when the user asks to restore (button / click / keypress). */
  onRestore: () => void
}

/**
 * The suspended-tab card. Semantic, dependency-free DOM so the page paints
 * instantly with the inline critical CSS already in `suspend.html` — no
 * flash-bang. The whole card is the click target; a focusable button keeps it
 * keyboard- and screen-reader-accessible.
 *
 * Postcondition: returns a detached `HTMLElement` ready to mount.
 */
export function SuspendCard({
  title,
  url,
  favIconUrl,
  recovery,
  onRestore,
}: SuspendCardProps): HTMLElement {
  const card = document.createElement("main")
  card.className = "suspend-card"
  card.setAttribute("data-recovery", String(recovery))

  const iconWrap = document.createElement("div")
  iconWrap.className = "suspend-card__icon"
  if (favIconUrl && !recovery && isSafeFaviconUrl(favIconUrl)) {
    const img = document.createElement("img")
    img.className = "suspend-card__favicon"
    img.src = favIconUrl
    img.alt = ""
    img.addEventListener("error", () => {
      img.remove()
      iconWrap.appendChild(zGlyph())
    })
    iconWrap.appendChild(img)
  } else {
    iconWrap.appendChild(zGlyph())
  }

  const titleEl = document.createElement("h1")
  titleEl.className = "suspend-card__title"
  titleEl.textContent = recovery
    ? "Nothing to restore"
    : title || hostOf(url) || "Suspended tab"

  card.append(iconWrap, titleEl)

  if (recovery) {
    const note = document.createElement("p")
    note.className = "suspend-card__note"
    note.textContent =
      "This suspended page was opened without an address to return to."
    card.appendChild(note)
    return card
  }

  if (url) {
    const urlEl = document.createElement("p")
    urlEl.className = "suspend-card__url"
    urlEl.textContent = url
    urlEl.title = url
    card.appendChild(urlEl)
  }

  const button = document.createElement("button")
  button.type = "button"
  button.className = "suspend-card__restore"
  button.textContent = "Restore tab"
  button.addEventListener("click", (e) => {
    e.stopPropagation()
    onRestore()
  })

  const hint = document.createElement("p")
  hint.className = "suspend-card__hint"
  hint.textContent = "Click anywhere or press Enter to restore"

  card.append(button, hint)
  return card
}

/** Sleep "Z" glyph — the suspended marker, drawn inline (no network). */
function zGlyph(): Node {
  const doc = new DOMParser().parseFromString(
    `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h7l-7 8h7"/><path d="M14 4h6l-6 7h6" opacity="0.55"/></svg>`,
    "image/svg+xml"
  )
  return document.importNode(doc.documentElement, true)
}

/** Only http/https/data favicons are safe to assign to img.src. */
function isSafeFaviconUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:" || protocol === "data:"
  } catch {
    return false
  }
}

/** Best-effort hostname extraction for the title fallback. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

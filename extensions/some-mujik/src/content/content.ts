// Injected into every tab. Determines its own role at runtime:
//
//   SOURCE  — this tab is a YouTube / YouTube Music URL.
//             Responds to ytmo:extract-meta requests from background with
//             scraped DOM metadata. Never mounts any UI.
//
//   DISPLAY — every other tab (the tab the user is actually looking at).
//             Receives ytmo:song-data pushes from background, mounts/updates
//             the overlay card. Never touches YT DOM.
//
// Role is resolved once at init via window.location.
// Concern separation is enforced at the call-site level inside each init fn:
// initSourceRole() never references any UI symbol;
// initDisplayRole() never references any extraction symbol.
//
// Static imports are used (not dynamic) to keep the build a single self-
// contained chunk — required by the extension no-shared-chunk constraint.
// No shared imports with popup.ts or background.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createOverlayCard } from "@mujik/components/ui/overlay-card"
import { createWaveformRenderer } from "@mujik/components/ui/waveform"
import { makeDraggable } from "@mujik/content/lib/draggable"
import { watchFullscreen } from "@mujik/content/lib/fullscreen"
import {
  FALLBACK_PARAMS,
  paramsFromSongMeta,
} from "@mujik/content/lib/song-params"
import { extractMetadata } from "@mujik/content/lib/yt-meta"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

import "@mujik/styles/content.css"

// ── Role determination ────────────────────────────────────────────────────────

const YT_ORIGINS: Array<string> = ["youtube.com", "music.youtube.com"]

function isYTTab(): boolean {
  try {
    const host = new URL(location.href).hostname
    return YT_ORIGINS.some((o) => host.endsWith(o))
  } catch {
    return false
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SOURCE ROLE
// ═════════════════════════════════════════════════════════════════════════════

function initSourceRole(): void {
  void browser.runtime.sendMessage({ type: "ytmo:register-source" })

  let currentHref: string = location.href

  const navObserver: MutationObserver = new MutationObserver((): void => {
    if (location.href !== currentHref) {
      currentHref = location.href
      void browser.runtime.sendMessage({ type: "ytmo:register-source" })
    }
  })

  navObserver.observe(document, { subtree: true, childList: true })

  browser.runtime.onMessage.addListener(
    (msg: unknown, _sender, sendResponse): boolean | void => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "type" in msg &&
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (msg as { type: string }).type === "ytmo:extract-meta"
      ) {
        const data = extractMetadata()
        sendResponse(data ?? null)
        return true // keep channel open (explicit)
      }
    }
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// DISPLAY ROLE
// ═════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY_POS = "ytmo_card_pos"

type OverlayCard = ReturnType<typeof createOverlayCard>
type WaveformRenderer = ReturnType<typeof createWaveformRenderer>
type DraggableHandle = ReturnType<typeof makeDraggable>
type FullscreenWatcher = ReturnType<typeof watchFullscreen>

type SongPayload = {
  isNewTrack: boolean
} & Record<string, unknown>

let overlayCard: OverlayCard | null = null
let waveformRenderer: WaveformRenderer | null = null
let draggableHandle: DraggableHandle | null = null
let fullscreenWatcher: FullscreenWatcher | null = null

function mountOverlay(): void {
  if (overlayCard !== null) return

  const root = getOverlayRoot()
  const card: OverlayCard = createOverlayCard()
  root.appendChild(card.root)

  // Mount with fallback params; first ytmo:song-data will immediately replace.
  const renderer: WaveformRenderer = createWaveformRenderer(
    card.canvas,
    FALLBACK_PARAMS
  )

  const drag: DraggableHandle = makeDraggable(card.root, {
    storageKey: STORAGE_KEY_POS,
    defaultX: window.innerWidth - 264,
    defaultY: 16,
  })

  const fs: FullscreenWatcher = watchFullscreen(
    () => card.root.classList.add("ytmo-card--hidden"),
    () => card.root.classList.remove("ytmo-card--hidden")
  )

  overlayCard = card
  waveformRenderer = renderer
  draggableHandle = drag
  fullscreenWatcher = fs
}

function destroyOverlay(): void {
  waveformRenderer?.destroy()
  draggableHandle?.destroy()
  fullscreenWatcher?.destroy()
  overlayCard?.destroy()

  overlayCard = null
  waveformRenderer = null
  draggableHandle = null
  fullscreenWatcher = null
}

function handleSongData(payload: SongPayload): void {
  const { isNewTrack, ...songData } = payload

  if (overlayCard === null) {
    mountOverlay()
  }
  if (overlayCard === null) return

  // Derive stable visual params from song identity fields.
  // Same song always produces the same params; different songs produce
  // decorrelated, well-distributed params across [0, 1].
  const params = paramsFromSongMeta(songData)

  overlayCard.update({
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    ...(songData as Parameters<OverlayCard["update"]>[0]),
    ...params,
  })

  if (isNewTrack && waveformRenderer !== null) {
    waveformRenderer.updateParams(params)
  }
}

function initDisplayRole(): void {
  browser.runtime.onMessage.addListener((msg: unknown): void => {
    if (typeof msg !== "object" || msg === null) return
    if (!("type" in msg)) return

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const m = msg as { type: string; payload?: unknown }

    if (m.type === "ytmo:song-data") {
      if (m.payload && typeof m.payload === "object") {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        handleSongData(m.payload as SongPayload)
      }
      return
    }

    if (m.type === "ytmo:clear") {
      destroyOverlay()
    }
  })
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

function main(): void {
  if (isYTTab()) {
    initSourceRole()
  } else {
    initDisplayRole()
  }
}

main()

export {}

// Root content script. Composes all modules.
// NOTE: All helper code is inlined or imported from within src/content/ only.
//       No shared modules with popup.ts or background.ts (build constraint).

import { makeDraggable } from "@mujik/content/lib/draggable"
import { watchFullscreen } from "@mujik/content/lib/fullscreen"
import { extractMetadata } from "@mujik/content/lib/yt-meta"
import { createOverlayCard } from "@mujik/components/ui/overlay-card"
import { createWaveformRenderer } from "@mujik/components/ui/waveform"
// ── CSS injection (Vite will bundle this) ─────────────────────────────────────
import "@mujik/styles/content.css"

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY_ENABLED = "ytmo_enabled"
const STORAGE_KEY_POS = "ytmo_card_pos"
const POLL_INTERVAL_MS = 4000

// ── Inlined emotion defaults (no shared import) ───────────────────────────────
// Until we wire WebAudio analysis, we use mid-range plausible values.
const DEFAULT_DIMS = { arousal: 0.5, valence: 0.55, tempo: 0.5, intensity: 0.6 }

// ── State ─────────────────────────────────────────────────────────────────────
let enabled = true
let overlayCard: ReturnType<typeof createOverlayCard> | null = null
let waveformRenderer: ReturnType<typeof createWaveformRenderer> | null = null
let draggableHandle: ReturnType<typeof makeDraggable> | null = null
let fullscreenWatcher: ReturnType<typeof watchFullscreen> | null = null
let pollTimer: number | null = null
let lastVideoId: string | null = null

// ── Read persisted enabled state ──────────────────────────────────────────────
try {
  const stored = localStorage.getItem(STORAGE_KEY_ENABLED)
  if (stored !== null) enabled = stored === "true"
} catch {
  /* ignore */
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function mountOverlay() {
  if (overlayCard) return

  const card = createOverlayCard()
  document.body.appendChild(card.root)

  // Waveform renderer — attach to the canvas the card owns
  const renderer = createWaveformRenderer(card.canvas, DEFAULT_DIMS)

  // Draggable
  const drag = makeDraggable(card.root, {
    storageKey: STORAGE_KEY_POS,
    defaultX: window.innerWidth - 264,
    defaultY: 16,
  })

  // Fullscreen watcher
  const fs = watchFullscreen(
    () => card.root.classList.add("ytmo-card--hidden"),
    () => card.root.classList.remove("ytmo-card--hidden")
  )

  overlayCard = card
  waveformRenderer = renderer
  draggableHandle = drag
  fullscreenWatcher = fs
}

function destroyOverlay() {
  waveformRenderer?.destroy()
  draggableHandle?.destroy()
  fullscreenWatcher?.destroy()
  overlayCard?.destroy()

  overlayCard = null
  waveformRenderer = null
  draggableHandle = null
  fullscreenWatcher = null
  lastVideoId = null
}

function poll() {
  if (!enabled) return

  const meta = extractMetadata()
  if (!meta) return

  if (!overlayCard) mountOverlay()

  const isNewTrack = meta.videoId !== lastVideoId
  lastVideoId = meta.videoId

  const songData = {
    ...meta,
    ...DEFAULT_DIMS, // Replace with WebAudio analysis when available
  }

  overlayCard!.update(songData)

  if (isNewTrack) {
    waveformRenderer?.updateParams(DEFAULT_DIMS)
  }
}

function startPolling() {
  if (pollTimer !== null) return
  // Initial check after slight delay (DOM settle)
  window.setTimeout(poll, 1500)
  pollTimer = window.setInterval(poll, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ── Message listener (from popup toggle) ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "ytmo:set-enabled") {
    enabled = msg.payload as boolean
    try {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled))
    } catch {
      /* ignore */
    }

    if (enabled) {
      startPolling()
      poll()
    } else {
      stopPolling()
      destroyOverlay()
    }
    sendResponse({ ok: true })
  }

  if (msg.type === "ytmo:get-state") {
    sendResponse({ enabled })
  }
})

// ── SPA navigation observer ───────────────────────────────────────────────────
// YouTube is a SPA; re-poll on URL changes
let currentHref = location.href
const navObserver = new MutationObserver(() => {
  if (location.href !== currentHref) {
    currentHref = location.href
    lastVideoId = null
    // Brief delay for YT to populate DOM
    window.setTimeout(poll, 1200)
  }
})
navObserver.observe(document, { subtree: true, childList: true })

// ── Init ──────────────────────────────────────────────────────────────────────
if (enabled) startPolling()

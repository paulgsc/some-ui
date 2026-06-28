// Central hub. Owns all cross-tab routing logic.
//
// Roles:
//   SOURCE tab  — any youtube.com/music.youtube.com tab playing audio.
//                 background polls it via ytmo:extract-meta, receives YTMetadata.
//   DISPLAY tab — whichever tab is currently active that is NOT the source tab.
//                 background pushes ytmo:song-data to it so the overlay renders.
//
// The content script is injected into every tab (all_urls) but behaves
// differently depending on which message type it receives:
//   ytmo:extract-meta  → source role: scrape DOM, reply with metadata
//   ytmo:song-data     → display role: mount/update overlay card
//
// No shared imports with content.ts or popup.ts.

// ── Types (inlined — no shared import across roots) ───────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

type YTMetadata = {
  title: string
  artist: string
  videoId: string
  thumbnailUrl: string
  currentTime: number
  duration: number
}

// ── State ─────────────────────────────────────────────────────────────────────

let enabled = true
let sourceTabId: number | null = null
let lastVideoId: string | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 4000
const YT_ORIGINS = ["youtube.com", "music.youtube.com"]

function isYTUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return YT_ORIGINS.some((o) => new URL(url).hostname.endsWith(o))
  } catch {
    return false
  }
}

// ── Source tab resolution ─────────────────────────────────────────────────────

async function resolveSourceTab(): Promise<number | null> {
  if (sourceTabId !== null) {
    try {
      const tab = await browser.tabs.get(sourceTabId)
      if (isYTUrl(tab.url)) return sourceTabId
    } catch {
      sourceTabId = null
    }
  }

  const tabs = await browser.tabs.query({})
  const yt = tabs.find((t) => isYTUrl(t.url) && t.id !== undefined)
  if (yt?.id) {
    sourceTabId = yt.id
    return sourceTabId
  }
  return null
}

// ── Display tab resolution ────────────────────────────────────────────────────

async function resolveDisplayTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  const tab = tabs[0]
  if (!tab?.id) return null

  if (tab.id === sourceTabId) {
    const others = await browser.tabs.query({ active: true })
    const other = others.find((t) => t.id !== sourceTabId && t.id !== undefined)
    return other?.id ?? null
  }
  return tab.id
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function sendToTab<T>(tabId: number, msg: object): Promise<T | null> {
  try {
    // browser.tabs.sendMessage returns a Promise natively.
    return await browser.tabs.sendMessage(tabId, msg)
  } catch (err) {
    // Handles 'Could not establish connection' (tab closed or no listener)
    // eslint-disable-next-line no-console
    console.error(err)
    return null
  }
}

// ── Poll cycle ────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (!enabled) return

  const srcId = await resolveSourceTab()
  if (!srcId) return

  const meta = await sendToTab<YTMetadata>(srcId, {
    type: "ytmo:extract-meta",
  })
  if (!meta) return

  const displayId = await resolveDisplayTab()
  if (!displayId) return

  const isNewTrack = meta.videoId !== lastVideoId
  lastVideoId = meta.videoId

  void sendToTab(displayId, {
    type: "ytmo:song-data",
    payload: { ...meta, isNewTrack },
  })
}

function startPolling(): void {
  if (pollTimer !== null) return
  setTimeout(() => {
    void poll()
  }, 1000)
  pollTimer = setInterval(() => {
    void poll()
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === sourceTabId) {
    sourceTabId = null
    lastVideoId = null
  }
})

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === sourceTabId && changeInfo.url && !isYTUrl(changeInfo.url)) {
    sourceTabId = null
    lastVideoId = null
  }
})

// ── Message listener ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ytmo:get-state") {
    sendResponse({ enabled })
    return
  }

  if (msg.type === "ytmo:set-enabled") {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    enabled = msg.payload as boolean
    if (enabled) startPolling()
    else {
      stopPolling()
      void broadcastClear()
    }
    sendResponse({ ok: true })
    return
  }

  if (msg.type === "ytmo:register-source" && sender.tab?.id) {
    sourceTabId = sender.tab.id
    sendResponse({ ok: true })
    return
  }
})

// ── Broadcast clear ───────────────────────────────────────────────────────────

async function broadcastClear(): Promise<void> {
  const tabs = await browser.tabs.query({})
  for (const tab of tabs) {
    if (tab.id && tab.id !== sourceTabId) {
      // Use catch to ignore errors when sending to tabs without our content script
      browser.tabs.sendMessage(tab.id, { type: "ytmo:clear" }).catch(() => {})
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
startPolling()

export {}

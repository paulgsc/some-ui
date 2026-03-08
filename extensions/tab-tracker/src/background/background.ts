/**
 * background.ts — TabLedger service worker
 *
 * Architecture: MV3 / Firefox-first
 *   - Uses browser.action (MV3) not browser.browserAction (MV2)
 *   - Single type source: webextension-polyfill only
 *     (remove @types/firefox-webext-browser from devDeps entirely)
 *   - Promise-based message handler — no sendResponse, no `return true`
 *   - No setInterval heartbeat: liveMs() computes elapsed on-demand,
 *     badge updates happen on activation events only
 *   - storage.local is canonical truth; in-memory state is a warm cache
 *     that can be reconstructed from storage on worker revival
 */

import type {
  BadgeTier,
  InboundMessage,
  LedgerState,
  OutboundMessage,
  TabRecord,
} from "@tab/types"

const STORAGE_KEY = "tabledger_state"
const BUCKET_SIZE_MS = 15 * 60 * 1000 // 15 minutes
const NEGLECT_ACTIVE_THRESHOLD_MS = 45 * 60 * 1000
const NEGLECT_IDLE_THRESHOLD_MS = 5 * 60 * 1000

function getBadgeTier(ms: number): BadgeTier {
  const m = ms / 60_000
  if (m < 15) return "green"
  if (m < 45) return "amber"
  if (m < 90) return "red"
  return "violet"
}

const BADGE_COLORS: Record<BadgeTier, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#7c3aed",
}

// ─── In-memory state (warm cache) ─────────────────────────────────────────────

let state: LedgerState = {
  records: {},
  activeTabId: null,
  sessionStart: Date.now(),
  seenNeglectPairs: [],
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadState(): Promise<void> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const saved = stored[STORAGE_KEY]
  if (!saved) return

  state = {
    ...saved,
    // Runtime-only fields reset on each worker boot
    activeTabId: null,
    sessionStart: Date.now(),
    seenNeglectPairs: [],
  }

  // All tabs start inactive — we'll re-activate the current one in bootstrap()
  for (const id of Object.keys(state.records)) {
    const record = state.records[Number(id)]
    record.isActive = false
    record.lastActivated = 0
    record.sessionMs = 0
  }
}

async function persistState(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state })
}

// ─── Record helpers ───────────────────────────────────────────────────────────

function ensureRecord(tabId: number, tab?: browser.tabs.Tab): TabRecord {
  if (state.records[tabId] === undefined) {
    state.records[tabId] = {
      tabId,
      url: tab?.url ?? "",
      title: tab?.title ?? "",
      favicon: tab?.favIconUrl ?? "",
      totalMs: 0,
      sessionMs: 0,
      lastActivated: 0,
      isActive: false,
      intentional: false,
      buckets: [],
      bucketStart: Date.now(),
    }
  }

  // Refresh mutable metadata from live tab
  const record = state.records[tabId]
  if (typeof tab?.url === "string") record.url = tab.url
  if (typeof tab?.title === "string") record.title = tab.title
  if (typeof tab?.favIconUrl === "string") record.favicon = tab.favIconUrl

  return record
}

/** Live total ms, including currently-active unflashed duration */
function liveMs(record: TabRecord): number {
  if (!record.isActive || record.lastActivated === 0) return record.totalMs
  return record.totalMs + (Date.now() - record.lastActivated)
}

/** Live session ms, including currently-active unflashed duration */
function liveMsSession(record: TabRecord): number {
  if (!record.isActive || record.lastActivated === 0) return record.sessionMs
  return record.sessionMs + (Date.now() - record.lastActivated)
}

/** Snapshot entire state with live-flushed ms values (for popup) */
function snapshotState(): LedgerState {
  return {
    ...state,
    records: Object.fromEntries(
      Object.entries(state.records).map(([id, r]) => [
        id,
        { ...r, totalMs: liveMs(r), sessionMs: liveMsSession(r) },
      ])
    ),
  }
}

// ─── Bucket accounting ────────────────────────────────────────────────────────

function addToBucket(record: TabRecord, elapsedMs: number): void {
  if (record.buckets.length === 0) {
    record.bucketStart = Date.now()
    record.buckets.push(0)
  }
  const idx = Math.floor((Date.now() - record.bucketStart) / BUCKET_SIZE_MS)
  while (record.buckets.length <= idx) record.buckets.push(0)
  record.buckets[idx] += elapsedMs
}

// ─── Badge (MV3 — browser.action) ─────────────────────────────────────────────

async function updateBadge(tabId: number): Promise<void> {
  const record = state.records[tabId]
  if (record === undefined) return

  const ms = liveMs(record)
  const tier = getBadgeTier(ms)
  const color = BADGE_COLORS[tier]
  const mins = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const text = hours > 0 ? `${hours}h` : `${mins}m`

  await Promise.all([
    browser.action.setBadgeText({ text }),
    browser.action.setBadgeBackgroundColor({ color }),
  ])
}

async function clearBadge(): Promise<void> {
  await browser.action.setBadgeText({ text: "" })
}

// ─── Tab activation / deactivation ────────────────────────────────────────────

async function activateTab(tabId: number): Promise<void> {
  // Flush the previously active tab before switching
  if (state.activeTabId !== null && state.activeTabId !== tabId) {
    await deactivateTab(state.activeTabId)
  }

  const tab = await browser.tabs.get(tabId).catch(() => null)
  if (tab === null) return

  const record = ensureRecord(tabId, tab)
  record.isActive = true
  record.lastActivated = Date.now()
  state.activeTabId = tabId

  await updateBadge(tabId)
}

async function deactivateTab(tabId: number): Promise<void> {
  const record = state.records[tabId]
  if (record === undefined || !record.isActive || record.lastActivated === 0)
    return

  const elapsed = Date.now() - record.lastActivated
  record.totalMs += elapsed
  record.sessionMs += elapsed
  addToBucket(record, elapsed)
  record.isActive = false
  record.lastActivated = 0

  if (state.activeTabId === tabId) state.activeTabId = null
}

// ─── Neglect detection ────────────────────────────────────────────────────────

function checkNeglect(activeTabId: number): string | null {
  const active = state.records[activeTabId]
  if (active === undefined) return null
  if (liveMsSession(active) < NEGLECT_ACTIVE_THRESHOLD_MS) return null

  const intentional = Object.values(state.records).filter(
    (r) => r.intentional && r.tabId !== activeTabId
  )

  for (const tab of intentional) {
    const key = `${activeTabId}_${tab.tabId}`
    if (state.seenNeglectPairs.includes(key)) continue
    if (tab.sessionMs < NEGLECT_IDLE_THRESHOLD_MS) {
      state.seenNeglectPairs.push(key)
      const domain = getDomainShort(tab.url)
      return domain.length > 0
        ? domain
        : tab.title.length > 0
          ? tab.title
          : "another tab"
    }
  }
  return null
}

function getDomainShort(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

// ─── Message handler (Promise-based, exhaustively typed) ──────────────────────
//
// webextension-polyfill wraps the callback-style API so returning a Promise
// here is fully supported on both Firefox and Chrome MV3.
// No sendResponse. No `return true`. Discriminated union narrows cleanly via
// switch (message.type) because InboundMessage is a proper tagged union.

browser.runtime.onMessage.addListener(
  (rawMessage, sender): Promise<OutboundMessage> => {
    // Cast once at the boundary — all subsequent access is type-safe
    const message = rawMessage as InboundMessage

    switch (message.type) {
      case "GET_OWN_TAB_ID": {
        return Promise.resolve({
          type: "OWN_TAB_ID",
          tabId: sender.tab?.id ?? null,
        })
      }

      case "GET_TAB_STATE": {
        const record = state.records[message.tabId] ?? null
        const neglect = record !== null ? checkNeglect(message.tabId) : null
        return Promise.resolve({
          type: "TAB_STATE",
          record,
          now: Date.now(),
          neglect,
        })
      }

      case "GET_FULL_STATE": {
        return Promise.resolve({
          type: "FULL_STATE",
          state: snapshotState(),
          now: Date.now(),
        })
      }

      case "PIN_TAB": {
        const record = state.records[message.tabId]
        if (record !== undefined) {
          record.intentional = !record.intentional
        }
        // Fire-and-forget persist; caller doesn't need to await it
        void persistState()
        return Promise.resolve({ type: "OK" })
      }

      case "RESET_SESSION": {
        for (const id of Object.keys(state.records)) {
          const record = state.records[Number(id)]
          record.sessionMs = 0
          if (record.isActive) record.lastActivated = Date.now()
        }
        state.sessionStart = Date.now()
        state.seenNeglectPairs = []
        void persistState()
        return Promise.resolve({ type: "OK" })
      }
    }
  }
)

// ─── Tab lifecycle ────────────────────────────────────────────────────────────

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  await activateTab(tabId)
  await persistState()
})

browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
  // tab.id is typed as optional in webextension-polyfill
  const id = tab.id
  if (id === undefined) return
  const record = state.records[id]
  if (record === undefined) return
  if (typeof tab.url === "string") record.url = tab.url
  if (typeof tab.title === "string") record.title = tab.title
  if (typeof tab.favIconUrl === "string") record.favicon = tab.favIconUrl
})

browser.tabs.onRemoved.addListener(async (tabId) => {
  await deactivateTab(tabId)
  delete state.records[tabId]
  await persistState()
})

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    // Browser lost focus — flush and pause active tab
    if (state.activeTabId !== null) {
      await deactivateTab(state.activeTabId)
      await clearBadge()
      await persistState()
    }
    return
  }

  // Browser regained focus — re-activate the focused window's active tab
  try {
    const tabs = await browser.tabs.query({ active: true, windowId })
    const tab = tabs[0]
    if (tab.id !== undefined) {
      await activateTab(tab.id)
      await persistState()
    }
  } catch {
    // Window may have closed between event and query
  }
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────
//
// In MV3 the service worker can spin up in response to any event, so we must
// be ready to reconstruct state before any listener fires. We register all
// listeners synchronously above (the browser buffers events), then hydrate
// async here. If a listener fires before bootstrap completes, state will be
// empty but self-consistent — no crashes.

async function bootstrap(): Promise<void> {
  await loadState()

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (tab.id !== undefined) {
      await activateTab(tab.id)
      await persistState()
    }
  } catch {
    // No active window (e.g. startup with no windows yet)
  }
}

void bootstrap()

export {}

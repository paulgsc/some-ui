/**
 *
 * Architecture:
 *   - Each tab is a "node" in the user's topology graph
 *   - Outcomes POST to local Axum server; errors are typestated
 *   - No duration tracking — active time only gates outcome registration
 *   - Banner text fetched from / persisted to Axum; falls back to local cache
 */

import type {
  BannerState,
  InboundMessage,
  NodeState,
  OutboundMessage,
  Outcome,
  Segment,
} from "@tab/types"

// ─── Config ───────────────────────────────────────────────────────────────────

const MIN_ACTIVE_MS_TO_REGISTER = 5 * 60 * 1000 // 5 minutes
const STORAGE_KEY = "tabledger_v2_nodes"
const AXUM_BASE = "http://localhost:3737"

// ─── Types ────────────────────────────────────────────────────────────────────

type AxumVisitResponse = {
  timestamp: number
}

type AxumBannerResponse = {
  text: string
}

type PersistedNode = Pick<NodeState, "url" | "segment" | "visits">
type StorageShape = Record<string, PersistedNode>

// ─── In-memory state ──────────────────────────────────────────────────────────

const nodes: Map<number, NodeState> = new Map()
let activeTabId: number | null = null

let bannerState: BannerState = {
  text: "",
  visible: true,
  lastFetchError: null,
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function isStorageShape(data: unknown): data is StorageShape {
  if (typeof data !== "object" || data === null) return false

  // Check if every value in the record matches our PersistedNode shape
  return Object.values(data).every(
    (node: any) =>
      typeof node.url === "string" &&
      Array.isArray(node.visits) &&
      (node.segment === null || typeof node.segment === "string")
  )
}

async function loadStorage(): Promise<void> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const raw = stored[STORAGE_KEY]
  if (!isStorageShape(raw)) return
  for (const [idStr, data] of Object.entries(raw)) {
    const tabId = Number(idStr)
    nodes.set(tabId, {
      tabId,
      url: data.url,
      segment: data.segment,
      visits: data.visits,
      lastActiveMs: 0,
      activeStart: null,
      lastPostError: null,
    })
  }
}

async function persistStorage(): Promise<void> {
  const shape: StorageShape = {}
  for (const [id, node] of nodes.entries()) {
    shape[String(id)] = {
      url: node.url,
      segment: node.segment,
      visits: node.visits,
    }
  }
  await browser.storage.local.set({ [STORAGE_KEY]: shape })
}

// ─── Node helpers ─────────────────────────────────────────────────────────────

function ensureNode(tabId: number, url?: string): NodeState {
  if (!nodes.has(tabId)) {
    nodes.set(tabId, {
      tabId,
      url: url ?? "",
      segment: null,
      visits: [],
      lastActiveMs: 0,
      activeStart: null,
      lastPostError: null,
    })
  }
  const node = nodes.get(tabId)!
  if (url) node.url = url
  return node
}

function liveActiveMs(node: NodeState): number {
  if (node.activeStart === null) return node.lastActiveMs
  return node.lastActiveMs + (Date.now() - node.activeStart)
}

function snapshotNode(node: NodeState): NodeState {
  return { ...node, lastActiveMs: liveActiveMs(node) }
}

// ─── Tab focus tracking ───────────────────────────────────────────────────────

function activateTab(tabId: number): void {
  if (activeTabId !== null && activeTabId !== tabId) {
    deactivateTab(activeTabId)
  }
  const node = ensureNode(tabId)
  node.activeStart = Date.now()
  activeTabId = tabId
}

function deactivateTab(tabId: number): void {
  const node = nodes.get(tabId)
  if (!node || node.activeStart === null) return
  node.lastActiveMs += Date.now() - node.activeStart
  node.activeStart = null
  if (activeTabId === tabId) activeTabId = null
}

// ─── Axum API ─────────────────────────────────────────────────────────────────

function connectionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED")) {
    return "Axum server unreachable (is it running on :3737?)"
  }
  return msg
}

async function postVisit(
  tabId: number,
  outcome: Outcome,
  segment: Segment
): Promise<{ timestamp: number } | { error: string }> {
  try {
    const resp = await fetch(`${AXUM_BASE}/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab_id: tabId, outcome, segment }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => `HTTP ${resp.status}`)
      return { error: `Server ${resp.status}: ${text}` }
    }
    const data: unknown = await resp.json()
    // Narrow the unknown response strictly
    if (
      typeof data === "object" &&
      data !== null &&
      "timestamp" in data &&
      typeof (data as Record<string, unknown>).timestamp === "number"
    ) {
      return { timestamp: (data as AxumVisitResponse).timestamp }
    }
    return { error: "Unexpected response shape from /visit" }
  } catch (err) {
    return { error: connectionError(err) }
  }
}

async function fetchBannerText(): Promise<string | { error: string }> {
  try {
    const resp = await fetch(`${AXUM_BASE}/banner`)
    if (!resp.ok) {
      return { error: `Server ${resp.status}` }
    }
    const data: unknown = await resp.json()
    if (
      typeof data === "object" &&
      data !== null &&
      "text" in data &&
      typeof (data as Record<string, unknown>).text === "string"
    ) {
      return (data as AxumBannerResponse).text
    }
    return { error: "Unexpected response shape from /banner" }
  } catch (err) {
    return { error: connectionError(err) }
  }
}

async function putBannerText(
  text: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const resp = await fetch(`${AXUM_BASE}/banner`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!resp.ok) {
      return { error: `Server ${resp.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { error: connectionError(err) }
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (rawMessage, sender): Promise<OutboundMessage> => {
    const message = rawMessage as InboundMessage

    switch (message.type) {
      case "GET_OWN_TAB_ID": {
        return Promise.resolve({
          type: "OWN_TAB_ID",
          tabId: sender.tab?.id ?? null,
        })
      }

      case "GET_NODE_STATE": {
        const node = nodes.get(message.tabId)
        return Promise.resolve({
          type: "NODE_STATE",
          state: node ? snapshotNode(node) : null,
        })
      }

      case "SET_SEGMENT": {
        const node = ensureNode(message.tabId)
        node.segment = message.segment
        void persistStorage()
        return Promise.resolve({ type: "OK" })
      }

      case "REGISTER_SESSION": {
        return (async (): Promise<OutboundMessage> => {
          const node = nodes.get(message.tabId)
          if (!node) return { type: "ERR", message: "Unknown tab" }

          const activeMs = liveActiveMs(node)
          if (activeMs < MIN_ACTIVE_MS_TO_REGISTER) {
            const remaining = Math.ceil(
              (MIN_ACTIVE_MS_TO_REGISTER - activeMs) / 1000
            )
            return {
              type: "ERR",
              message: `Need ${remaining}s more active time`,
            }
          }

          if (!node.segment) {
            return { type: "ERR", message: "Assign a segment first" }
          }

          const result = await postVisit(
            message.tabId,
            message.outcome,
            node.segment
          )

          if ("error" in result) {
            node.lastPostError = result.error
            // Fallback: record locally with local timestamp
            node.visits.push({
              outcome: message.outcome,
              timestamp: Date.now(),
            })
            void persistStorage()
            return { type: "ERR", message: result.error }
          }

          node.lastPostError = null
          node.visits.push({
            outcome: message.outcome,
            timestamp: result.timestamp,
          })
          void persistStorage()
          return { type: "OK" }
        })()
      }

      case "TICK_ACTIVE": {
        return Promise.resolve({ type: "OK" })
      }

      case "GET_BANNER": {
        return (async (): Promise<OutboundMessage> => {
          const result = await fetchBannerText()
          if (typeof result === "string") {
            bannerState = { ...bannerState, text: result, lastFetchError: null }
          } else {
            bannerState = { ...bannerState, lastFetchError: result.error }
          }
          return { type: "BANNER_STATE", banner: bannerState }
        })()
      }

      case "SET_BANNER_TEXT": {
        return (async (): Promise<OutboundMessage> => {
          bannerState = { ...bannerState, text: message.text }
          const result = await putBannerText(message.text)
          if ("error" in result) {
            bannerState = { ...bannerState, lastFetchError: result.error }
            return { type: "ERR", message: result.error }
          }
          bannerState = { ...bannerState, lastFetchError: null }
          return { type: "OK" }
        })()
      }
    }
  }
)

// ─── Tab lifecycle ────────────────────────────────────────────────────────────

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId)
    ensureNode(tabId, tab.url)
  } catch {}
  activateTab(tabId)
  void persistStorage()
})

browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
  const id = tab.id
  if (id === undefined) return
  const node = nodes.get(id)
  if (!node) return
  if (typeof tab.url === "string") node.url = tab.url
})

browser.tabs.onRemoved.addListener((tabId) => {
  deactivateTab(tabId)
  void persistStorage()
})

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    if (activeTabId !== null) {
      deactivateTab(activeTabId)
      void persistStorage()
    }
    return
  }
  try {
    const tabs = await browser.tabs.query({ active: true, windowId })
    const tab = tabs[0]
    if (tab.id !== undefined) {
      ensureNode(tab.id, tab.url)
      activateTab(tab.id)
      void persistStorage()
    }
  } catch {}
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await loadStorage()
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (tab.id !== undefined) {
      ensureNode(tab.id, tab.url)
      activateTab(tab.id)
      void persistStorage()
    }
  } catch {}
}

void bootstrap()

export {}

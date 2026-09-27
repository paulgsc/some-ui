//
// Storage schema (browser.storage.local):
//   drama_moments:  MomentRecord[]   — mood capture log
//   drama_watchlist: DramaEntry[]      — ordered list, max N=5
//   drama_active_id: string | null     — id of entry currently displayed
//
// Message types:
//   GET_STATE      → { ok, state }
//   UPSERT_ENTRY   → add or update a DramaEntry; broadcasts STATE_UPDATE
//   REMOVE_ENTRY   → remove by id; broadcasts STATE_UPDATE
//   SET_ACTIVE     → set activeId; broadcasts STATE_UPDATE
//   SAVE_MOMENT, GET_MOMENTS, CLEAR_MOMENTS — mood capture log (unchanged)

import type {
  DramaEntry,
  MessageBridge,
  MessageResponseMap,
  MomentRecord,
  StateUpdateMessage,
  WatchlistState,
} from "@drama/types"
import { assertNever, isRecord } from "@some-extension/common"

/** Replies with the envelope the sender's `sendMsg` is typed to expect. */
type Reply<T extends MessageBridge["type"]> = (
  resp: MessageResponseMap[T]
) => void

// ── Constants ─────────────────────────────────────────────────────────────────

const MOMENTS_KEY = "drama_moments"
const WATCHLIST_KEY = "drama_watchlist"
const ACTIVE_ID_KEY = "drama_active_id"
const MAX_WATCHLIST = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ── Runtime guards ────────────────────────────────────────────────────────────
//
// browser.runtime.onMessage hands us `unknown`. These guards are the single
// validation boundary — no `as` past this point.

function isMomentRecord(v: unknown): v is MomentRecord {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.timestamp === "number" &&
    typeof v.mood === "string" &&
    typeof v.episodeId === "string" &&
    typeof v.dramaTitle === "string" &&
    typeof v.capturedAt === "number"
  )
}

function isBackgroundMessage(v: unknown): v is MessageBridge {
  if (!isRecord(v)) return false
  if (typeof v.type !== "string") return false

  switch (v.type) {
    case "SAVE_MOMENT": {
      return isMomentRecord(v.payload)
    }
    case "GET_MOMENTS": {
      return (
        v.payload === undefined ||
        (isRecord(v.payload) &&
          (!("dramaTitle" in v.payload) ||
            typeof v.payload.dramaTitle === "string"))
      )
    }
    case "CLEAR_MOMENTS":
    case "GET_STATE": {
      return true
    }
    case "UPSERT_ENTRY": {
      return isRecord(v.entry) && typeof v.entry.title === "string"
    }
    case "REMOVE_ENTRY": {
      return typeof v.id === "string"
    }
    case "SET_ACTIVE": {
      return v.id === null || typeof v.id === "string"
    }
    // eslint-disable-next-line switch-lint/require-fail-fast-default
    default: {
      return false
    }
  }
}

// ── Storage helpers ──────────────────────────────────────────────────────────
//
// browser.storage.local.get returns Record<string, unknown> — these helpers
// narrow per-key with a default, no `as` at call sites.

function isDramaEntryArray(v: unknown): v is Array<DramaEntry> {
  return (
    Array.isArray(v) && v.every((e) => isRecord(e) && typeof e.id === "string")
  )
}

function isMomentRecordArray(v: unknown): v is Array<MomentRecord> {
  return Array.isArray(v) && v.every(isMomentRecord)
}

// ── Moment helpers ────────────────────────────────────────────────────────────

async function loadMoments(): Promise<Array<MomentRecord>> {
  const r = await browser.storage.local.get(MOMENTS_KEY)
  const stored = r[MOMENTS_KEY]
  return isMomentRecordArray(stored) ? stored : []
}

async function saveMoment(moment: MomentRecord): Promise<void> {
  const existing = await loadMoments()
  existing.push(moment)
  await browser.storage.local.set({ [MOMENTS_KEY]: existing })
}

// ── Watchlist helpers ─────────────────────────────────────────────────────────

async function getWatchlistState(): Promise<WatchlistState> {
  const r = await browser.storage.local.get([WATCHLIST_KEY, ACTIVE_ID_KEY])
  const watchlist = r[WATCHLIST_KEY]
  const activeId = r[ACTIVE_ID_KEY]
  return {
    watchlist: isDramaEntryArray(watchlist) ? watchlist : [],
    activeId: typeof activeId === "string" ? activeId : null,
  }
}

async function setWatchlistState(
  patch: Partial<WatchlistState>
): Promise<void> {
  const update: Record<string, unknown> = {}
  if ("watchlist" in patch) update[WATCHLIST_KEY] = patch.watchlist
  if ("activeId" in patch) update[ACTIVE_ID_KEY] = patch.activeId
  await browser.storage.local.set(update)
}

/**
 * Defaults for fields that must always be present on a stored DramaEntry.
 * Used only on INSERT — update path merges with the existing stored entry
 * so no defaults are needed there.
 */
const ENTRY_DEFAULTS: Omit<DramaEntry, "id" | "addedAt" | "title"> = {
  episode: "",
  network: "",
  year: "",
  genre: "",
  note: "",
  color: "",
  url: "",
  posterUrl: null,
  timestamp: "00:00",
  progress: 0,
  isPlaying: false,
  rating: 0,
  completionLikelihood: 0.5,
  activeMood: null,
  featuredQuote: "",
  emotionLabel: "",
  overallProgress: 0,

  axes: { connection: 0, hope: 0, trust: 0, control: 0 },
  transition: { before: "", after: "" },
  tags: [],
  peakLine: "",
  momentum: { value: 50, direction: "steady" },
}

/** Broadcast updated state to every loaded tab; content.ts guards itself. */
async function broadcastState(state: WatchlistState): Promise<void> {
  let tabs: Array<browser.tabs.Tab>
  try {
    tabs = await browser.tabs.query({})
  } catch {
    return
  }
  for (const tab of tabs) {
    if (tab.id === undefined || tab.status !== "complete") continue
    try {
      const msg: StateUpdateMessage = { type: "STATE_UPDATE", payload: state }
      await browser.tabs.sendMessage(tab.id, msg)
    } catch {
      // Tab has no content script — expected
    }
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────
//
// Each handler owns its sendResponse call(s) and returns void; the listener
// awaits/handles the returned promise so nothing is floating.

async function handleSaveMoment(
  payload: MomentRecord,
  sendResponse: Reply<"SAVE_MOMENT">
): Promise<void> {
  try {
    await saveMoment(payload)
    sendResponse({ ok: true })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleGetMoments(
  payload: { dramaTitle?: string } | undefined,
  sendResponse: Reply<"GET_MOMENTS">
): Promise<void> {
  try {
    const moments = await loadMoments()
    const filter = payload?.dramaTitle
    const filtered = filter
      ? moments.filter((m) => m.dramaTitle === filter)
      : moments
    sendResponse({ ok: true, moments: filtered })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleClearMoments(
  sendResponse: Reply<"CLEAR_MOMENTS">
): Promise<void> {
  try {
    await browser.storage.local.remove(MOMENTS_KEY)
    sendResponse({ ok: true })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleGetState(sendResponse: Reply<"GET_STATE">): Promise<void> {
  try {
    const state = await getWatchlistState()
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

// UPDATE path: spread stored entry then incoming — all fields preserved,
//   only provided fields overwritten. posterUrl, rating, etc. survive.
//
// INSERT path: spread ENTRY_DEFAULTS then incoming — all fields present,
//   user-provided values win, nothing is silently dropped.
//   `id` and `addedAt` are always generated fresh on insert.
async function handleUpsertEntry(
  incoming: Partial<DramaEntry> & { title: string },
  sendResponse: Reply<"UPSERT_ENTRY">
): Promise<void> {
  try {
    const { watchlist, activeId } = await getWatchlistState()
    const existingIdx = incoming.id
      ? watchlist.findIndex((e) => e.id === incoming.id)
      : -1

    let next: Array<DramaEntry>

    if (existingIdx >= 0) {
      next = watchlist.map((e, i) =>
        i === existingIdx ? { ...e, ...incoming } : e
      )
    } else {
      if (watchlist.length >= MAX_WATCHLIST) {
        sendResponse({
          ok: false,
          error: `Watchlist full (max ${MAX_WATCHLIST}). Remove an entry first.`,
        })
        return
      }
      const newEntry: DramaEntry = {
        ...ENTRY_DEFAULTS,
        ...incoming,
        id: uuid(),
        addedAt: Date.now(),
      }
      next = [...watchlist, newEntry]
    }

    const [firstNext] = next
    const newActive =
      activeId ?? (next.length === 1 ? (firstNext?.id ?? null) : null)
    await setWatchlistState({ watchlist: next, activeId: newActive })
    const state: WatchlistState = { watchlist: next, activeId: newActive }
    await broadcastState(state)
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleRemoveEntry(
  id: string,
  sendResponse: Reply<"REMOVE_ENTRY">
): Promise<void> {
  try {
    const { watchlist, activeId } = await getWatchlistState()
    const next = watchlist.filter((e) => e.id !== id)
    const newActive = activeId === id ? (next[0]?.id ?? null) : activeId
    await setWatchlistState({ watchlist: next, activeId: newActive })
    const state: WatchlistState = { watchlist: next, activeId: newActive }
    await broadcastState(state)
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleSetActive(
  id: string | null,
  sendResponse: Reply<"SET_ACTIVE">
): Promise<void> {
  try {
    const { watchlist } = await getWatchlistState()
    await setWatchlistState({ activeId: id })
    const state: WatchlistState = { watchlist, activeId: id }
    await broadcastState(state)
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function dispatch(
  message: MessageBridge,
  sendResponse: Reply<MessageBridge["type"]>
): Promise<void> {
  const { type: t } = message
  switch (t) {
    case "SAVE_MOMENT": {
      return handleSaveMoment(message.payload, sendResponse)
    }
    case "GET_MOMENTS": {
      return handleGetMoments(message.payload, sendResponse)
    }
    case "CLEAR_MOMENTS": {
      return handleClearMoments(sendResponse)
    }
    case "GET_STATE": {
      return handleGetState(sendResponse)
    }
    case "UPSERT_ENTRY": {
      return handleUpsertEntry(message.entry, sendResponse)
    }
    case "REMOVE_ENTRY": {
      return handleRemoveEntry(message.id, sendResponse)
    }
    case "SET_ACTIVE": {
      return handleSetActive(message.id, sendResponse)
    }
    default: {
      t satisfies never
      assertNever(t)
    }
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    msg: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: Reply<MessageBridge["type"]>
  ): boolean => {
    if (!isBackgroundMessage(msg)) return false

    void dispatch(msg, sendResponse)
    return true
  }
)

// ── Install ───────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(() => {
  void (async () => {
    const existing = await browser.storage.local.get([WATCHLIST_KEY])
    if (!existing[WATCHLIST_KEY]) {
      await setWatchlistState({ watchlist: [], activeId: null })
    }
  })()
})

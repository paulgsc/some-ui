//
// Storage schema (browser.storage.local):
//   drama_watchlist:  DramaEntry[]    — ordered list, max N=5
//   drama_active_id:  string | null   — id of entry currently displayed
//   drama_beats:      BeatRecord[]    — the live emotional log (bounded)
//   drama_source_tab: number | null   — tab playing the drama (validated on use)
//   drama_stream_sites: string[]      — sites the user marked as streaming sites
//   drama_moments:    legacy mood log; every record has timestamp 0, so it is
//                     no longer read — left in place rather than deleted.
//
// Tab roles (the some-mujik pattern): every tab is a DISPLAY tab by default —
// it renders the card, which OBS captures. A tab on a site the user marked as
// a streaming site is a SOURCE tab: it plays the drama, renders no card,
// captures hotkeys with its own video time, and answers GET_PLAYBACK.
//
// Message types:
//   GET_STATE       → { ok, state }
//   UPSERT_ENTRY    → add or update a DramaEntry; broadcasts STATE_UPDATE
//   REMOVE_ENTRY    → remove by id; broadcasts STATE_UPDATE
//   SET_ACTIVE      → set activeId; broadcasts STATE_UPDATE
//   REGISTER_SOURCE → the sending tab is now the source tab
//   SET_STREAM_SITE → mark / unmark a streaming site; broadcasts STATE_UPDATE
//   LOG_BEAT        → log or escalate a beat for the active drama; broadcasts
//                     BEAT_LOGGED. Asks the source tab for playback when the
//                     press came from a display tab.
//   GET_BEATS       → the drama's latest episode and its beats

import {
  episodeBeats,
  latestEpisode,
  logBeat,
  normalizeEpisode,
} from "@drama/logic/beats"
import { MOODS } from "@drama/logic/content/constants"
import { isStreamSite, siteOf, withStreamSite } from "@drama/logic/stream-sites"
import type {
  BeatLoggedMessage,
  BeatRecord,
  DramaEntry,
  GetPlaybackMessage,
  MessageBridge,
  MessageResponseMap,
  MoodType,
  Playback,
  StateUpdateMessage,
  WatchlistState,
} from "@drama/types"
import { assertNever, isRecord } from "@some-extension/common"

/** Replies with the envelope the sender's `sendMsg` is typed to expect. */
type Reply<T extends MessageBridge["type"]> = (
  resp: MessageResponseMap[T]
) => void

// ── Constants ─────────────────────────────────────────────────────────────────

const BEATS_KEY = "drama_beats"
const SOURCE_TAB_KEY = "drama_source_tab"
const STREAM_SITES_KEY = "drama_stream_sites"
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

function isMoodType(v: unknown): v is MoodType {
  return MOODS.some((m) => m.type === v)
}

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || typeof v === "number"
}

function isPlayback(v: unknown): v is Playback {
  return (
    isRecord(v) &&
    typeof v.videoTime === "number" &&
    isNumberOrNull(v.duration) &&
    typeof v.episode === "string"
  )
}

function isBeatRecord(v: unknown): v is BeatRecord {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.dramaId === "string" &&
    typeof v.dramaTitle === "string" &&
    typeof v.episode === "string" &&
    isMoodType(v.mood) &&
    (v.intensity === 1 || v.intensity === 2 || v.intensity === 3) &&
    isNumberOrNull(v.videoTime) &&
    isNumberOrNull(v.duration) &&
    typeof v.capturedAt === "number" &&
    typeof v.updatedAt === "number"
  )
}

function isBackgroundMessage(v: unknown): v is MessageBridge {
  if (!isRecord(v)) return false
  if (typeof v.type !== "string") return false

  switch (v.type) {
    case "LOG_BEAT": {
      return (
        isMoodType(v.mood) && (v.playback === null || isPlayback(v.playback))
      )
    }
    case "GET_BEATS": {
      return typeof v.dramaId === "string"
    }
    case "SET_STREAM_SITE": {
      return typeof v.site === "string" && typeof v.streaming === "boolean"
    }
    case "REGISTER_SOURCE":
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

// ── Beat log ──────────────────────────────────────────────────────────────────

async function loadBeats(): Promise<Array<BeatRecord>> {
  const r = await browser.storage.local.get(BEATS_KEY)
  const stored = r[BEATS_KEY]
  // Per-record filter, not all-or-nothing: one malformed record must not cost
  // the whole log.
  return Array.isArray(stored) ? stored.filter(isBeatRecord) : []
}

// Every LOG_BEAT is a read-modify-write of the whole log, and repeat presses
// land a few hundred ms apart — serialize them so an escalation is never lost
// to an interleaved write.
let beatWrites: Promise<unknown> = Promise.resolve()

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = beatWrites.then(work, work)
  beatWrites = run.catch(() => undefined)
  return run
}

// ── Source tab ────────────────────────────────────────────────────────────────

async function getSourceTabId(): Promise<number | null> {
  const r = await browser.storage.local.get(SOURCE_TAB_KEY)
  const id = r[SOURCE_TAB_KEY]
  if (typeof id !== "number") return null
  try {
    await browser.tabs.get(id)
    return id
  } catch {
    // Closed, or a tab id from a previous browser session.
    await browser.storage.local.remove(SOURCE_TAB_KEY)
    return null
  }
}

/** Ask the source tab where its video is; null if there is none to ask. */
async function requestPlayback(): Promise<Playback | null> {
  const tabId = await getSourceTabId()
  if (tabId === null) return null
  try {
    const msg: GetPlaybackMessage = { type: "GET_PLAYBACK" }
    const reply: unknown = await browser.tabs.sendMessage(tabId, msg)
    return isPlayback(reply) ? reply : null
  } catch {
    return null
  }
}

browser.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const r = await browser.storage.local.get(SOURCE_TAB_KEY)
    if (r[SOURCE_TAB_KEY] === tabId) {
      await browser.storage.local.remove(SOURCE_TAB_KEY)
    }
  })()
})

// ── Watchlist helpers ─────────────────────────────────────────────────────────

async function getWatchlistState(): Promise<WatchlistState> {
  const r = await browser.storage.local.get([
    WATCHLIST_KEY,
    ACTIVE_ID_KEY,
    STREAM_SITES_KEY,
  ])
  const watchlist = r[WATCHLIST_KEY]
  const activeId = r[ACTIVE_ID_KEY]
  const streamSites = r[STREAM_SITES_KEY]
  return {
    watchlist: isDramaEntryArray(watchlist) ? watchlist : [],
    activeId: typeof activeId === "string" ? activeId : null,
    streamSites: Array.isArray(streamSites)
      ? streamSites.filter((x): x is string => typeof x === "string")
      : [],
  }
}

async function setWatchlistState(
  patch: Partial<WatchlistState>
): Promise<void> {
  const update: Record<string, unknown> = {}
  if ("watchlist" in patch) update[WATCHLIST_KEY] = patch.watchlist
  if ("activeId" in patch) update[ACTIVE_ID_KEY] = patch.activeId
  if ("streamSites" in patch) update[STREAM_SITES_KEY] = patch.streamSites
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

/** Send to every loaded tab; each content script decides what applies to it. */
async function broadcast(
  msg: StateUpdateMessage | BeatLoggedMessage
): Promise<void> {
  let tabs: Array<browser.tabs.Tab>
  try {
    tabs = await browser.tabs.query({})
  } catch {
    return
  }
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || tab.status !== "complete") return
      try {
        await browser.tabs.sendMessage(tab.id, msg)
      } catch {
        // Tab has no content script — expected
      }
    })
  )
}

function broadcastState(state: WatchlistState): Promise<void> {
  return broadcast({ type: "STATE_UPDATE", payload: state })
}

// ── Handlers ──────────────────────────────────────────────────────────────────
//
// Each handler owns its sendResponse call(s) and returns void; the listener
// awaits/handles the returned promise so nothing is floating.

async function handleLogBeat(
  mood: MoodType,
  playback: Playback | null,
  sendResponse: Reply<"LOG_BEAT">
): Promise<void> {
  try {
    const { watchlist, activeId } = await getWatchlistState()
    const entry = watchlist.find((e) => e.id === activeId)
    if (!entry) {
      sendResponse({
        ok: false,
        error: "No active drama. Pick one in the popup first.",
      })
      return
    }
    // A press on the source tab carries its own playback; a press anywhere
    // else asks the source tab. Neither reachable → a beat with no video time.
    const pb = playback ?? (await requestPlayback())
    const beat = await serialized(async () => {
      const result = logBeat(await loadBeats(), {
        id: uuid(),
        dramaId: entry.id,
        dramaTitle: entry.title,
        episode: normalizeEpisode(pb?.episode || entry.episode),
        mood,
        videoTime: pb?.videoTime ?? null,
        duration: pb?.duration ?? null,
        at: Date.now(),
      })
      await browser.storage.local.set({ [BEATS_KEY]: result.beats })
      return result.beat
    })
    await broadcast({ type: "BEAT_LOGGED", beat })
    sendResponse({ ok: true, beat })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleGetBeats(
  dramaId: string,
  sendResponse: Reply<"GET_BEATS">
): Promise<void> {
  try {
    const [{ watchlist }, beats] = await Promise.all([
      getWatchlistState(),
      loadBeats(),
    ])
    const entry = watchlist.find((e) => e.id === dramaId)
    const episode = latestEpisode(
      beats,
      dramaId,
      normalizeEpisode(entry?.episode ?? "")
    )
    sendResponse({
      ok: true,
      episode,
      beats: episodeBeats(beats, dramaId, episode),
    })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleRegisterSource(
  tabId: number | undefined,
  sendResponse: Reply<"REGISTER_SOURCE">
): Promise<void> {
  try {
    if (tabId === undefined) {
      sendResponse({ ok: false, error: "REGISTER_SOURCE needs a sender tab" })
      return
    }
    await browser.storage.local.set({ [SOURCE_TAB_KEY]: tabId })
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
    const { watchlist, activeId, streamSites } = await getWatchlistState()
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
    const state: WatchlistState = {
      watchlist: next,
      activeId: newActive,
      streamSites,
    }
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
    const { watchlist, activeId, streamSites } = await getWatchlistState()
    const next = watchlist.filter((e) => e.id !== id)
    const newActive = activeId === id ? (next[0]?.id ?? null) : activeId
    await setWatchlistState({ watchlist: next, activeId: newActive })
    const state: WatchlistState = {
      watchlist: next,
      activeId: newActive,
      streamSites,
    }
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
    const { watchlist, streamSites } = await getWatchlistState()
    await setWatchlistState({ activeId: id })
    const state: WatchlistState = { watchlist, activeId: id, streamSites }
    await broadcastState(state)
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleSetStreamSite(
  site: string,
  streaming: boolean,
  sendResponse: Reply<"SET_STREAM_SITE">
): Promise<void> {
  try {
    const current = await getWatchlistState()
    // Normalized the same way content tabs resolve their own site, so
    // "WWW.Viki.com" marks the site "viki.com" tabs will match.
    const normalized = siteOf(`https://${site.trim()}`)
    const streamSites = withStreamSite(
      current.streamSites,
      normalized,
      streaming
    )
    await setWatchlistState({ streamSites })

    // Unmarking the site the source tab is on: that tab turns back into a
    // display tab (it re-resolves its role from the broadcast below), so it
    // can no longer answer for the drama's playback.
    const sourceId = await getSourceTabId()
    if (sourceId !== null) {
      const tab = await browser.tabs.get(sourceId)
      if (!isStreamSite(tab.url ?? "", streamSites)) {
        await browser.storage.local.remove(SOURCE_TAB_KEY)
      }
    }

    const state: WatchlistState = { ...current, streamSites }
    await broadcastState(state)
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function dispatch(
  message: MessageBridge,
  sender: browser.runtime.MessageSender,
  sendResponse: Reply<MessageBridge["type"]>
): Promise<void> {
  const { type: t } = message
  switch (t) {
    case "LOG_BEAT": {
      return handleLogBeat(message.mood, message.playback, sendResponse)
    }
    case "GET_BEATS": {
      return handleGetBeats(message.dramaId, sendResponse)
    }
    case "REGISTER_SOURCE": {
      return handleRegisterSource(sender.tab?.id, sendResponse)
    }
    case "SET_STREAM_SITE": {
      return handleSetStreamSite(message.site, message.streaming, sendResponse)
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
    sender: browser.runtime.MessageSender,
    sendResponse: Reply<MessageBridge["type"]>
  ): boolean => {
    if (!isBackgroundMessage(msg)) return false

    void dispatch(msg, sender, sendResponse)
    return true
  }
)

// ── Install ───────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(() => {
  void (async () => {
    const existing = await browser.storage.local.get([WATCHLIST_KEY])
    if (!existing[WATCHLIST_KEY]) {
      await setWatchlistState({
        watchlist: [],
        activeId: null,
        streamSites: [],
      })
    }
  })()
})

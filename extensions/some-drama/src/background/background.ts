//
// Storage schema (browser.storage.local):
//   drama_watchlist:  DramaEntry[]    — ordered list, max N=5
//   drama_active_id:  string | null   — id of entry currently displayed
//   drama_beats:      BeatRecord[]    — the live emotional log (bounded)
//   drama_verdicts:   VerdictRecord[] — rating / likelihood-to-finish changes,
//                                       for longitudinal tracking (bounded)
//   drama_stream_sites: string[]      — sites the user marked as streaming sites
//   drama_moments:    legacy mood log; every record has timestamp 0, so it is
//                     no longer read — left in place rather than deleted.
//   drama_source_tab: legacy registered source tab; source tabs are now asked
//                     fresh on every beat, so it is no longer read.
//
// Tab roles (the some-mujik pattern): every tab is a DISPLAY tab by default —
// it renders the card, which OBS captures. A tab on a site the user marked as
// a streaming site is a SOURCE tab: it plays the drama, renders no card,
// captures hotkeys with its own video time, and answers GET_PLAYBACK. No tab
// is registered as "the" source: a display tab's beat asks every tab on a
// marked site and logic/source.ts picks the answer (the playing one).
//
// Message types:
//   GET_STATE       → { ok, state }
//   UPSERT_ENTRY    → add or update a DramaEntry; broadcasts STATE_UPDATE
//   REMOVE_ENTRY    → remove by id; broadcasts STATE_UPDATE
//   SET_ACTIVE      → set activeId; broadcasts STATE_UPDATE
//   SET_STREAM_SITE → mark / unmark a streaming site; broadcasts STATE_UPDATE
//   LOG_BEAT        → log or escalate a beat for the active drama; broadcasts
//                     BEAT_LOGGED. Asks the source tabs for playback when the
//                     press came from a display tab.
//   GET_BEATS       → the drama's latest episode and its beats
//   ADJUST_VERDICT  → set or step the active drama's rating or likelihood to
//                     finish; logs the change; broadcasts STATE_UPDATE (display
//                     tabs refetch GET_VERDICTS when a verdict moved)
//   GET_VERDICTS    → every logged verdict change of one drama
//
// Verdict changes are logged wherever they come from: ADJUST_VERDICT (hotkeys,
// the card) and UPSERT_ENTRY (popup edits, and a new drama's first values).
// Removing a drama keeps its history.

import {
  episodeBeats,
  latestEpisode,
  logBeat,
  normalizeEpisode,
} from "@drama/logic/beats"
import { MOODS } from "@drama/logic/content/constants"
import { pickSource } from "@drama/logic/source"
import { isStreamSite, siteOf, withStreamSite } from "@drama/logic/stream-sites"
import {
  applyVerdict,
  isVerdictChange,
  isVerdictField,
} from "@drama/logic/verdict"
import { dramaVerdicts, logVerdict } from "@drama/logic/verdict-log"
import type {
  BeatLoggedMessage,
  BeatRecord,
  DramaEntry,
  GetPlaybackMessage,
  MessageBridge,
  MessageResponseMap,
  MoodType,
  Playback,
  SourceReport,
  StateUpdateMessage,
  VerdictChange,
  VerdictField,
  VerdictRecord,
  WatchlistState,
} from "@drama/types"
import { assertNever, isRecord } from "@some-extension/common"

/** Replies with the envelope the sender's `sendMsg` is typed to expect. */
type Reply<T extends MessageBridge["type"]> = (
  resp: MessageResponseMap[T]
) => void

// ── Constants ─────────────────────────────────────────────────────────────────

const BEATS_KEY = "drama_beats"
const VERDICTS_KEY = "drama_verdicts"
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

function isVerdictRecord(v: unknown): v is VerdictRecord {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.dramaId === "string" &&
    typeof v.dramaTitle === "string" &&
    typeof v.episode === "string" &&
    isVerdictField(v.field) &&
    isNumberOrNull(v.from) &&
    typeof v.to === "number" &&
    isNumberOrNull(v.videoTime) &&
    typeof v.at === "number"
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
    case "ADJUST_VERDICT": {
      return isVerdictField(v.field) && isVerdictChange(v.change)
    }
    case "GET_VERDICTS": {
      return typeof v.dramaId === "string"
    }
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

// ── Verdict log ───────────────────────────────────────────────────────────────

async function loadVerdicts(): Promise<Array<VerdictRecord>> {
  const r = await browser.storage.local.get(VERDICTS_KEY)
  const stored = r[VERDICTS_KEY]
  return Array.isArray(stored) ? stored.filter(isVerdictRecord) : []
}

type VerdictMove = { field: VerdictField; from: number | null; to: number }

/**
 * Log `moves` of `entry`'s verdicts. Call inside `serialized`: it is a
 * read-modify-write of the whole log.
 */
async function recordVerdicts(
  entry: DramaEntry,
  moves: ReadonlyArray<VerdictMove>,
  playback: Playback | null
): Promise<void> {
  if (moves.length === 0) return
  let verdicts = await loadVerdicts()
  for (const move of moves) {
    const result = logVerdict(verdicts, {
      id: uuid(),
      dramaId: entry.id,
      dramaTitle: entry.title,
      episode: normalizeEpisode(playback?.episode || entry.episode),
      ...move,
      videoTime: playback?.videoTime ?? null,
      at: Date.now(),
    })
    verdicts = result.verdicts
  }
  await browser.storage.local.set({ [VERDICTS_KEY]: verdicts })
}

/** The verdicts `incoming` changes on `prev` (a new drama when prev is null). */
function verdictMoves(
  prev: DramaEntry | null,
  next: DramaEntry,
  incoming: Partial<DramaEntry>
): Array<VerdictMove> {
  const fields: ReadonlyArray<VerdictField> = ["rating", "completionLikelihood"]
  return fields
    .filter((f) => typeof incoming[f] === "number")
    .map((f) => ({ field: f, from: prev ? prev[f] : null, to: next[f] }))
    .filter((m) => m.from !== m.to)
}

// Every LOG_BEAT is a read-modify-write of the whole log, and repeat presses
// land a few hundred ms apart — serialize them so an escalation is never lost
// to an interleaved write. Every read-modify-write of the watchlist state
// (UPSERT_ENTRY, REMOVE_ENTRY, SET_ACTIVE, SET_STREAM_SITE, ADJUST_VERDICT)
// and of the verdict log shares the queue for the same reason: two quick
// verdict steps must step twice, and a removal racing a verdict write must
// not be undone by the verdict writer's stale copy of the list. Each
// operation also publishes (STATE_UPDATE, BEAT_LOGGED) before it leaves the
// queue, so tabs hear changes in the order they were written: a slow first
// broadcast can't land after the one that superseded it.
let writes: Promise<unknown> = Promise.resolve()

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = writes.then(work, work)
  writes = run.catch(() => undefined)
  return run
}

// ── Source tabs ──────────────────────────────────────────────────────────────

// Beats and verdict steps ask for playback from inside the write queue (so
// they are applied in the order they were pressed); a source tab that does
// not answer must not hold every later write, so each ask is bounded.
const PLAYBACK_TIMEOUT_MS = 500

function isSourceReport(v: unknown): v is SourceReport {
  return (
    isRecord(v) &&
    isPlayback(v.playback) &&
    typeof v.playing === "boolean" &&
    typeof v.lastPlayAt === "number"
  )
}

/**
 * Ask every tab on a marked site where its video is, and pick the drama's
 * (logic/source.ts); null when no source tab answers. Asked fresh each time,
 * so a tab that closed or left the site is never the one asked.
 */
async function requestPlayback(): Promise<Playback | null> {
  const { streamSites } = await getWatchlistState()
  if (streamSites.length === 0) return null
  let tabs: Array<browser.tabs.Tab>
  try {
    tabs = await browser.tabs.query({})
  } catch {
    return null
  }
  const msg: GetPlaybackMessage = { type: "GET_PLAYBACK" }
  const reports = await Promise.all(
    tabs.map(async (tab): Promise<SourceReport | null> => {
      if (tab.id === undefined || !isStreamSite(tab.url ?? "", streamSites)) {
        return null
      }
      try {
        const reply: unknown = await Promise.race([
          browser.tabs.sendMessage(tab.id, msg),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), PLAYBACK_TIMEOUT_MS)
          ),
        ])
        return isSourceReport(reply) ? reply : null
      } catch {
        return null
      }
    })
  )
  return pickSource(reports.filter((r): r is SourceReport => r !== null))
}

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
  // The press's place in the queue, and its time, are taken now, before any
  // await: two quick presses are applied in the order they were made, not
  // the order their playback lookups happened to return.
  const at = Date.now()
  try {
    const beat = await serialized(async () => {
      const { watchlist, activeId } = await getWatchlistState()
      const entry = watchlist.find((e) => e.id === activeId)
      if (!entry) return null
      // A press on the source tab carries its own playback; a press anywhere
      // else asks the source tab. Neither reachable → no video time.
      const pb = playback ?? (await requestPlayback())
      const result = logBeat(await loadBeats(), {
        id: uuid(),
        dramaId: entry.id,
        dramaTitle: entry.title,
        episode: normalizeEpisode(pb?.episode || entry.episode),
        mood,
        videoTime: pb?.videoTime ?? null,
        duration: pb?.duration ?? null,
        at,
      })
      await browser.storage.local.set({ [BEATS_KEY]: result.beats })
      // Published inside the queue, so displays hear a beat and its
      // escalations in the order they were written.
      await broadcast({ type: "BEAT_LOGGED", beat: result.beat })
      return result.beat
    })
    if (!beat) {
      sendResponse({
        ok: false,
        error: "No active drama. Pick one in the popup first.",
      })
      return
    }
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
    const result = await serialized(async () => {
      const { watchlist, activeId, streamSites } = await getWatchlistState()
      const prev = incoming.id
        ? (watchlist.find((e) => e.id === incoming.id) ?? null)
        : null

      let entry: DramaEntry
      let next: Array<DramaEntry>
      if (prev) {
        entry = { ...prev, ...incoming }
        next = watchlist.map((e) => (e.id === prev.id ? entry : e))
      } else {
        if (watchlist.length >= MAX_WATCHLIST) {
          return {
            ok: false as const,
            error: `Watchlist full (max ${MAX_WATCHLIST}). Remove an entry first.`,
          }
        }
        entry = {
          ...ENTRY_DEFAULTS,
          ...incoming,
          id: uuid(),
          addedAt: Date.now(),
        }
        next = [...watchlist, entry]
      }

      const [firstNext] = next
      const newActive =
        activeId ?? (next.length === 1 ? (firstNext?.id ?? null) : null)
      await setWatchlistState({ watchlist: next, activeId: newActive })
      await recordVerdicts(entry, verdictMoves(prev, entry, incoming), null)
      const state: WatchlistState = {
        watchlist: next,
        activeId: newActive,
        streamSites,
      }
      await broadcastState(state)
      return { ok: true as const, state }
    })

    if (!result.ok) {
      sendResponse({ ok: false, error: result.error })
      return
    }
    sendResponse({ ok: true, state: result.state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleRemoveEntry(
  id: string,
  sendResponse: Reply<"REMOVE_ENTRY">
): Promise<void> {
  try {
    const state = await serialized(async () => {
      const { watchlist, activeId, streamSites } = await getWatchlistState()
      const next = watchlist.filter((e) => e.id !== id)
      const newActive = activeId === id ? (next[0]?.id ?? null) : activeId
      await setWatchlistState({ watchlist: next, activeId: newActive })
      const removed: WatchlistState = {
        watchlist: next,
        activeId: newActive,
        streamSites,
      }
      await broadcastState(removed)
      return removed
    })
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
    const state = await serialized(async () => {
      const { watchlist, streamSites } = await getWatchlistState()
      await setWatchlistState({ activeId: id })
      const activated: WatchlistState = { watchlist, activeId: id, streamSites }
      await broadcastState(activated)
      return activated
    })
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
    // Normalized the same way content tabs resolve their own site, so
    // "WWW.Viki.com" marks the site "viki.com" tabs will match.
    const normalized = siteOf(`https://${site.trim()}`)
    const state = await serialized(async () => {
      const read = await getWatchlistState()
      const marked: WatchlistState = {
        ...read,
        streamSites: withStreamSite(read.streamSites, normalized, streaming),
      }
      await setWatchlistState({ streamSites: marked.streamSites })
      await broadcastState(marked)
      return marked
    })
    sendResponse({ ok: true, state })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleAdjustVerdict(
  field: VerdictField,
  change: VerdictChange,
  sendResponse: Reply<"ADJUST_VERDICT">
): Promise<void> {
  try {
    // Queued before any await, like a beat: down-then-up must land in that
    // order whichever playback lookup returns first.
    const result = await serialized(async () => {
      const current = await getWatchlistState()
      const entry = current.watchlist.find((e) => e.id === current.activeId)
      if (!entry) return null
      // Where the drama is, for the log.
      const playback = await requestPlayback()
      const value = applyVerdict(entry[field], field, change)
      const watchlist = current.watchlist.map((e) =>
        e.id === entry.id ? { ...e, [field]: value } : e
      )
      await setWatchlistState({ watchlist })
      await recordVerdicts(
        entry,
        value === entry[field]
          ? []
          : [{ field, from: entry[field], to: value }],
        playback
      )
      const state: WatchlistState = { ...current, watchlist }
      await broadcastState(state)
      return state
    })
    if (!result) {
      sendResponse({
        ok: false,
        error: "No active drama. Pick one in the popup first.",
      })
      return
    }
    sendResponse({ ok: true, state: result })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleGetVerdicts(
  dramaId: string,
  sendResponse: Reply<"GET_VERDICTS">
): Promise<void> {
  try {
    sendResponse({
      ok: true,
      verdicts: dramaVerdicts(await loadVerdicts(), dramaId),
    })
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
    case "LOG_BEAT": {
      return handleLogBeat(message.mood, message.playback, sendResponse)
    }
    case "GET_BEATS": {
      return handleGetBeats(message.dramaId, sendResponse)
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
    case "ADJUST_VERDICT": {
      return handleAdjustVerdict(message.field, message.change, sendResponse)
    }
    case "GET_VERDICTS": {
      return handleGetVerdicts(message.dramaId, sendResponse)
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
      await setWatchlistState({
        watchlist: [],
        activeId: null,
        streamSites: [],
      })
    }
  })()
})

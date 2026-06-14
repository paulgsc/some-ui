//
// Storage schema (browser.storage.local):
//   drama_moments:  CapturedMoment[]   — mood capture log
//   drama_watchlist: DramaEntry[]      — ordered list, max N=5
//   drama_active_id: string | null     — id of entry currently displayed
//
// Message types:
//   GET_STATE      → { ok, state }
//   UPSERT_ENTRY   → add or update a DramaEntry; broadcasts STATE_UPDATE
//   REMOVE_ENTRY   → remove by id; broadcasts STATE_UPDATE
//   SET_ACTIVE     → set activeId; broadcasts STATE_UPDATE
//   SCRAPE_TAB     → executeScript heuristic on given tabId, returns raw meta
//   SAVE_MOMENT, GET_MOMENTS, CLEAR_MOMENTS — mood capture log (unchanged)

// ── Inline types (no shared chunks) ──────────────────────────────────────────
import type {
  DramaEntry,
  MoodType,
  ScrapedMeta,
  WatchlistState,
} from "@drama/types"

type CapturedMoment = {
  id: string
  timestamp: number
  mood: MoodType
  episodeId: string
  dramaTitle: string
  capturedAt: number
}

type BackgroundMessage =
  | { type: "SAVE_MOMENT"; payload: CapturedMoment }
  | { type: "GET_MOMENTS"; payload?: { dramaTitle?: string } }
  | { type: "CLEAR_MOMENTS" }
  | { type: "GET_STATE" }
  | { type: "UPSERT_ENTRY"; entry: Partial<DramaEntry> & { title: string } }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "SCRAPE_TAB"; tabId: number }

type BackgroundResponse =
  | {
      ok: true
      moments?: Array<CapturedMoment>
      state?: WatchlistState
      data?: ScrapedMeta | null
    }
  | { ok: false; error: string }

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

function isCapturedMoment(v: unknown): v is CapturedMoment {
  if (typeof v !== "object" || v === null) return false
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const m = v as Record<string, unknown>
  return (
    typeof m.id === "string" &&
    typeof m.timestamp === "number" &&
    typeof m.mood === "string" &&
    typeof m.episodeId === "string" &&
    typeof m.dramaTitle === "string" &&
    typeof m.capturedAt === "number"
  )
}

function isBackgroundMessage(v: unknown): v is BackgroundMessage {
  if (typeof v !== "object" || v === null) return false
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const m = v as Record<string, unknown>
  if (typeof m.type !== "string") return false

  switch (m.type) {
    case "SAVE_MOMENT":
      return isCapturedMoment(m.payload)
    case "GET_MOMENTS":
      return (
        m.payload === undefined ||
        (typeof m.payload === "object" &&
          m.payload !== null &&
          (("dramaTitle" in m.payload &&
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            typeof (m.payload as Record<string, unknown>).dramaTitle ===
              "string") ||
            !("dramaTitle" in m.payload)))
      )
    case "CLEAR_MOMENTS":
    case "GET_STATE":
      return true
    case "UPSERT_ENTRY":
      return (
        typeof m.entry === "object" &&
        m.entry !== null &&
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        typeof (m.entry as Record<string, unknown>).title === "string"
      )
    case "REMOVE_ENTRY":
      return typeof m.id === "string"
    case "SET_ACTIVE":
      return m.id === null || typeof m.id === "string"
    case "SCRAPE_TAB":
      return typeof m.tabId === "number"
    default:
      return false
  }
}

// ── Storage helpers ──────────────────────────────────────────────────────────
//
// browser.storage.local.get returns Record<string, unknown> — these helpers
// narrow per-key with a default, no `as` at call sites.

function isDramaEntryArray(v: unknown): v is Array<DramaEntry> {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        typeof (e as Record<string, unknown>).id === "string"
    )
  )
}

function isCapturedMomentArray(v: unknown): v is Array<CapturedMoment> {
  return Array.isArray(v) && v.every(isCapturedMoment)
}

// ── Moment helpers ────────────────────────────────────────────────────────────

async function loadMoments(): Promise<Array<CapturedMoment>> {
  const r = await browser.storage.local.get(MOMENTS_KEY)
  const stored = r[MOMENTS_KEY]
  return isCapturedMomentArray(stored) ? stored : []
}

async function saveMoment(moment: CapturedMoment): Promise<void> {
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

/** Broadcast updated state to all non-video content-script tabs. */
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
      await browser.tabs.sendMessage(tab.id, {
        type: "STATE_UPDATE",
        payload: state,
      })
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
  payload: CapturedMoment,
  sendResponse: (resp: BackgroundResponse) => void
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
  sendResponse: (resp: BackgroundResponse) => void
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
  sendResponse: (resp: BackgroundResponse) => void
): Promise<void> {
  try {
    await browser.storage.local.remove(MOMENTS_KEY)
    sendResponse({ ok: true })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function handleGetState(
  sendResponse: (resp: BackgroundResponse) => void
): Promise<void> {
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
  sendResponse: (resp: BackgroundResponse) => void
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
  sendResponse: (resp: BackgroundResponse) => void
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
  sendResponse: (resp: BackgroundResponse) => void
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

function isScrapedMeta(v: unknown): v is ScrapedMeta {
  if (typeof v !== "object" || v === null) return false
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const m = v as Record<string, unknown>
  return (
    typeof m.title === "string" &&
    typeof m.episode === "string" &&
    typeof m.network === "string" &&
    typeof m.url === "string" &&
    (m.posterUrl === null || typeof m.posterUrl === "string") &&
    typeof m.timestamp === "string" &&
    typeof m.progress === "number" &&
    typeof m.isPlaying === "boolean" &&
    typeof m.videoCount === "number"
  )
}

async function handleScrapeTab(
  tabId: number,
  sendResponse: (resp: BackgroundResponse) => void
): Promise<void> {
  try {
    const results = await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          var ytTitle   = document.querySelector(
            'h1.ytd-watch-metadata yt-formatted-string, h1.title.ytd-video-primary-info-renderer'
          )?.textContent?.trim();
          var nfTitle   = document.querySelector(
            '.video-title h4, [data-uia="video-title"]'
          )?.textContent?.trim();
          var vikiTitle = document.querySelector(
            '.episode-title, .show-title'
          )?.textContent?.trim();
          var metaTitle = document.querySelector(
            'meta[property="og:title"]'
          )?.content?.trim();
          var docTitle  = document.title?.replace(/\\s*[-|].*$/, '').trim();

          var network = document.querySelector(
            'meta[name="application-name"]'
          )?.content?.trim()
            || new URL(location.href).hostname.replace(/^www\\./, '');

          var epMatch = (ytTitle || vikiTitle || metaTitle || docTitle || '').match(
            /ep(?:isode)?[.\\s]*([\\d]+)/i
          );

          var video    = Array.from(document.querySelectorAll('video'))
            .sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height)
              - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
          var posterUrl = video?.poster
            || document.querySelector("meta[property='og:image']")?.content
            || null;
          var progress  = video && video.duration
            ? video.currentTime / video.duration : 0;
          var timestamp = video
            ? (function(s) {
                var h = Math.floor(s / 3600),
                    m = Math.floor((s % 3600) / 60),
                    sec = Math.floor(s % 60);
                var p = function(n) { return String(n).padStart(2, '0'); };
                return h > 0 ? h + ':' + p(m) + ':' + p(sec) : p(m) + ':' + p(sec);
              })(video.currentTime)
            : '00:00';

          return {
            title:      ytTitle || nfTitle || vikiTitle || metaTitle || docTitle || '',
            episode:    epMatch ? 'Ep ' + epMatch[1] : '',
            network:    network || '',
            url:        location.href,
            posterUrl:  posterUrl,
            timestamp:  timestamp,
            progress:   progress,
            isPlaying:  video ? (!video.paused && !video.ended) : false,
            videoCount: document.querySelectorAll('video').length,
          };
        })()
      `,
    })

    const raw = results.length > 0 ? results[0] : undefined
    const data = isScrapedMeta(raw) ? raw : null
    sendResponse({ ok: true, data })
  } catch (err) {
    sendResponse({ ok: false, error: String(err) })
  }
}

async function dispatch(
  message: BackgroundMessage,
  sendResponse: (resp: BackgroundResponse) => void
): Promise<void> {
  switch (message.type) {
    case "SAVE_MOMENT":
      return handleSaveMoment(message.payload, sendResponse)
    case "GET_MOMENTS":
      return handleGetMoments(message.payload, sendResponse)
    case "CLEAR_MOMENTS":
      return handleClearMoments(sendResponse)
    case "GET_STATE":
      return handleGetState(sendResponse)
    case "UPSERT_ENTRY":
      return handleUpsertEntry(message.entry, sendResponse)
    case "REMOVE_ENTRY":
      return handleRemoveEntry(message.id, sendResponse)
    case "SET_ACTIVE":
      return handleSetActive(message.id, sendResponse)
    case "SCRAPE_TAB":
      return handleScrapeTab(message.tabId, sendResponse)
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    msg: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (resp: BackgroundResponse) => void
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

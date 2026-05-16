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
      data?: ScrapedMeta
    }
  | { ok: false; error: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const MOMENTS_KEY = "drama_moments"
const WATCHLIST_KEY = "drama_watchlist"
const ACTIVE_ID_KEY = "drama_active_id"
const MAX_WATCHLIST = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

const VIDEO_HOSTS = [
  "youtube.com",
  "netflix.com",
  "viki.com",
  "disneyplus.com",
  "hulu.com",
  "twitch.tv",
  "primevideo.com",
  "crunchyroll.com",
  "wetv.vip",
  "weverse.io",
]

function isVideoTab(url: string | undefined): boolean {
  if (!url) return true
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    return VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return true
  }
}

function uuid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ── Moment helpers ────────────────────────────────────────────────────────────

async function loadMoments(): Promise<Array<CapturedMoment>> {
  const r = await browser.storage.local.get(MOMENTS_KEY)
  return (r[MOMENTS_KEY] as Array<CapturedMoment> | undefined) ?? []
}

async function saveMoment(moment: CapturedMoment): Promise<void> {
  const existing = await loadMoments()
  existing.push(moment)
  await browser.storage.local.set({ [MOMENTS_KEY]: existing })
  console.log("[Background] Saved moment:", moment.id)
}

// ── Watchlist helpers ─────────────────────────────────────────────────────────

async function getWatchlistState(): Promise<WatchlistState> {
  const r = await browser.storage.local.get([WATCHLIST_KEY, ACTIVE_ID_KEY])
  return {
    watchlist: (r[WATCHLIST_KEY] as Array<DramaEntry> | undefined) ?? [],
    activeId: (r[ACTIVE_ID_KEY] as string | null | undefined) ?? null,
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
    if (!tab.id || tab.status !== "complete") continue
    if (isVideoTab(tab.url)) continue
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

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    msg: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (resp: BackgroundResponse) => void
  ) => {
    const message = msg as BackgroundMessage

    switch (message.type) {
      // ── Moments ───────────────────────────────────────────────────────────

      case "SAVE_MOMENT":
        saveMoment(message.payload)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      case "GET_MOMENTS":
        loadMoments()
          .then((moments) => {
            const filter = message.payload?.dramaTitle
            const filtered = filter
              ? moments.filter((m) => m.dramaTitle === filter)
              : moments
            sendResponse({ ok: true, moments: filtered })
          })
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      case "CLEAR_MOMENTS":
        browser.storage.local
          .remove(MOMENTS_KEY)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      // ── State: read ───────────────────────────────────────────────────────

      case "GET_STATE":
        getWatchlistState()
          .then((state) => sendResponse({ ok: true, state }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      // ── State: upsert ─────────────────────────────────────────────────────
      //
      // UPDATE path: spread stored entry then incoming — all fields preserved,
      //   only provided fields overwritten. posterUrl, rating, etc. survive.
      //
      // INSERT path: spread ENTRY_DEFAULTS then incoming — all fields present,
      //   user-provided values win, nothing is silently dropped.
      //   `id` and `addedAt` are always generated fresh on insert.

      case "UPSERT_ENTRY": {
        const incoming = message.entry
        ;(async () => {
          const { watchlist, activeId } = await getWatchlistState()
          const existingIdx = incoming.id
            ? watchlist.findIndex((e) => e.id === incoming.id)
            : -1

          let next: Array<DramaEntry>

          if (existingIdx >= 0) {
            // UPDATE — merge stored entry with incoming; stored fields not in
            // incoming are untouched, so opinionated fields survive a Facts-only edit.
            next = watchlist.map((e, i) =>
              i === existingIdx ? { ...e, ...incoming } : e
            )
          } else {
            // INSERT — guard capacity first
            if (watchlist.length >= MAX_WATCHLIST) {
              sendResponse({
                ok: false,
                error: `Watchlist full (max ${MAX_WATCHLIST}). Remove an entry first.`,
              })
              return
            }
            // Spread order: defaults → incoming → identity fields
            // This means every field in DramaEntry is present; nothing dropped.
            const newEntry: DramaEntry = {
              ...ENTRY_DEFAULTS,
              ...incoming,
              id: uuid(),
              addedAt: Date.now(),
            }
            next = [...watchlist, newEntry]
          }

          const newActive = activeId ?? (next.length === 1 ? next[0].id : null)
          await setWatchlistState({ watchlist: next, activeId: newActive })
          const state: WatchlistState = { watchlist: next, activeId: newActive }
          await broadcastState(state)
          sendResponse({ ok: true, state })
        })().catch((err: unknown) =>
          sendResponse({ ok: false, error: String(err) })
        )
        return true
      }

      // ── State: remove ─────────────────────────────────────────────────────

      case "REMOVE_ENTRY": {
        const { id } = message
        ;(async () => {
          const { watchlist, activeId } = await getWatchlistState()
          const next = watchlist.filter((e) => e.id !== id)
          const newActive = activeId === id ? (next[0]?.id ?? null) : activeId
          await setWatchlistState({ watchlist: next, activeId: newActive })
          const state: WatchlistState = { watchlist: next, activeId: newActive }
          await broadcastState(state)
          sendResponse({ ok: true, state })
        })().catch((err: unknown) =>
          sendResponse({ ok: false, error: String(err) })
        )
        return true
      }

      // ── State: set active ─────────────────────────────────────────────────

      case "SET_ACTIVE": {
        const { id } = message
        ;(async () => {
          const { watchlist } = await getWatchlistState()
          await setWatchlistState({ activeId: id })
          const state: WatchlistState = { watchlist, activeId: id }
          await broadcastState(state)
          sendResponse({ ok: true, state })
        })().catch((err: unknown) =>
          sendResponse({ ok: false, error: String(err) })
        )
        return true
      }

      // ── Scrape tab ────────────────────────────────────────────────────────

      case "SCRAPE_TAB": {
        const { tabId } = message
        ;(async () => {
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
            sendResponse({
              ok: true,
              data: (results?.[0] as ScrapedMeta) ?? null,
            })
          } catch (err) {
            sendResponse({ ok: false, error: String(err) })
          }
        })()
        return true
      }

      default:
        return false
    }
  }
)

// ── Install ───────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.storage.local.get([WATCHLIST_KEY])
  if (!existing[WATCHLIST_KEY]) {
    await setWatchlistState({ watchlist: [], activeId: null })
  }
  console.log("[Background] Drama Overlay background worker ready.")
})

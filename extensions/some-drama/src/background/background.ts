// ── background.ts ─────────────────────────────────────────────────────────────
// PATCH #2: Extended with watchlist state management.
//
// Storage schema (browser.storage.local):
//   drama_moments: CapturedMoment[]     — mood capture log (unchanged)
//   drama_watchlist: DramaEntry[]       — ordered list, max N=5
//   drama_active_id: string | null      — id of entry currently displayed
//
// Message types added:
//   GET_STATE      → { watchlist, activeId }
//   UPSERT_ENTRY   → add or update a DramaEntry; broadcasts STATE_UPDATE
//   REMOVE_ENTRY   → remove by id; broadcasts STATE_UPDATE
//   SET_ACTIVE     → set activeId; broadcasts STATE_UPDATE
//   SCRAPE_TAB     → executeScript heuristic on given tabId, returns raw meta
//
// Existing messages unchanged:
//   SAVE_MOMENT, GET_MOMENTS, CLEAR_MOMENTS

// ── Shared inline types (no shared chunks) ────────────────────────────────────

type EmotionType = "joy" | "sadness" | "love" | "rage" | "fear" | "neutral"

interface CapturedMoment {
  id: string
  timestamp: number
  emotion: EmotionType
  intensity: number
  emoji: string
  note?: string
  episodeId: string
  dramaTitle: string
  capturedAt: number
}

interface DramaEntry {
  id: string
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  color: string
  addedAt: number
}

interface WatchlistState {
  watchlist: DramaEntry[]
  activeId: string | null
}

type BackgroundMessage =
  // ── Existing ──
  | { type: "SAVE_MOMENT"; payload: CapturedMoment }
  | { type: "GET_MOMENTS"; payload?: { dramaTitle?: string } }
  | { type: "CLEAR_MOMENTS" }
  // ── Watchlist ──
  | { type: "GET_STATE" }
  | { type: "UPSERT_ENTRY"; entry: Partial<DramaEntry> & { title: string } }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "SCRAPE_TAB"; tabId: number }

type BackgroundResponse =
  | { ok: true; moments?: CapturedMoment[]; state?: WatchlistState; data?: ScrapedMeta }
  | { ok: false; error: string }

interface ScrapedMeta {
  title: string
  episode: string
  network: string
  url: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MOMENTS_KEY   = "drama_moments"
const WATCHLIST_KEY = "drama_watchlist"
const ACTIVE_ID_KEY = "drama_active_id"
const MAX_WATCHLIST = 5

// ── Video-tab host list (mirrors manifest exclude_matches) ────────────────────

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

// ── Moment helpers ────────────────────────────────────────────────────────────

async function loadMoments(): Promise<CapturedMoment[]> {
  const result = await browser.storage.local.get(MOMENTS_KEY)
  return (result[MOMENTS_KEY] as CapturedMoment[] | undefined) ?? []
}

async function saveMoment(moment: CapturedMoment): Promise<void> {
  const existing = await loadMoments()
  existing.push(moment)
  await browser.storage.local.set({ [MOMENTS_KEY]: existing })
  console.log("[Background] Saved moment:", moment.id, "@", moment.timestamp)
}

// ── Watchlist helpers ─────────────────────────────────────────────────────────

async function getWatchlistState(): Promise<WatchlistState> {
  const r = await browser.storage.local.get([WATCHLIST_KEY, ACTIVE_ID_KEY])
  return {
    watchlist: (r[WATCHLIST_KEY] as DramaEntry[] | undefined) ?? [],
    activeId: (r[ACTIVE_ID_KEY] as string | null | undefined) ?? null,
  }
}

async function setWatchlistState(patch: Partial<WatchlistState>): Promise<void> {
  const update: Record<string, unknown> = {}
  if ("watchlist" in patch) update[WATCHLIST_KEY] = patch.watchlist
  if ("activeId" in patch) update[ACTIVE_ID_KEY] = patch.activeId
  await browser.storage.local.set(update)
}

function uuid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Broadcast updated watchlist state to all eligible content-script tabs. */
async function broadcastState(state: WatchlistState): Promise<void> {
  let tabs: browser.tabs.Tab[]
  try {
    tabs = await browser.tabs.query({})
  } catch {
    return
  }
  for (const tab of tabs) {
    if (!tab.id || tab.status !== "complete") continue
    if (isVideoTab(tab.url)) continue
    try {
      await browser.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", payload: state })
    } catch {
      // Tab has no content script loaded — expected for some pages
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

      // ── Mood moments (unchanged) ──────────────────────────────────────────

      case "SAVE_MOMENT":
        saveMoment(message.payload)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
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
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true

      case "CLEAR_MOMENTS":
        browser.storage.local
          .remove(MOMENTS_KEY)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true

      // ── Watchlist: read ───────────────────────────────────────────────────

      case "GET_STATE":
        getWatchlistState()
          .then((state) => sendResponse({ ok: true, state }))
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true

      // ── Watchlist: upsert ─────────────────────────────────────────────────

      case "UPSERT_ENTRY": {
        const incoming = message.entry
        ;(async () => {
          const { watchlist, activeId } = await getWatchlistState()
          const idx = incoming.id
            ? watchlist.findIndex((e) => e.id === incoming.id)
            : -1

          let next: DramaEntry[]
          if (idx >= 0) {
            next = watchlist.map((e, i) =>
              i === idx ? { ...e, ...incoming } as DramaEntry : e
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
              id: uuid(),
              title: incoming.title,
              episode: incoming.episode ?? "",
              network: incoming.network ?? "",
              year: incoming.year ?? "",
              genre: incoming.genre ?? "",
              note: incoming.note ?? "",
              color: incoming.color ?? "",
              addedAt: Date.now(),
            }
            next = [...watchlist, newEntry]
          }

          // Auto-activate if this is the first entry
          const newActive = activeId ?? (next.length === 1 ? next[0].id : null)
          await setWatchlistState({ watchlist: next, activeId: newActive })
          const state: WatchlistState = { watchlist: next, activeId: newActive }
          await broadcastState(state)
          sendResponse({ ok: true, state })
        })().catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      // ── Watchlist: remove ─────────────────────────────────────────────────

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
        })().catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      // ── Watchlist: set active ─────────────────────────────────────────────

      case "SET_ACTIVE": {
        const { id } = message
        ;(async () => {
          const { watchlist } = await getWatchlistState()
          await setWatchlistState({ activeId: id })
          const state: WatchlistState = { watchlist, activeId: id }
          await broadcastState(state)
          sendResponse({ ok: true, state })
        })().catch((err: unknown) => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      // ── Heuristic scrape (popup → background → video tab DOM) ────────────

      case "SCRAPE_TAB": {
        const { tabId } = message
        ;(async () => {
          try {
            const results = await browser.tabs.executeScript(tabId, {
              code: `
                (function() {
                  var ytTitle  = document.querySelector(
                    'h1.ytd-watch-metadata yt-formatted-string, h1.title.ytd-video-primary-info-renderer'
                  )?.textContent?.trim();
                  var nfTitle  = document.querySelector(
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
                  )?.content?.trim() || new URL(location.href).hostname.replace(/^www\\./, '');

                  var epMatch = (ytTitle || vikiTitle || metaTitle || docTitle || '').match(
                    /ep(?:isode)?[.\\s]*([\\d]+)/i
                  );

                  return {
                    title:   ytTitle || nfTitle || vikiTitle || metaTitle || docTitle || '',
                    episode: epMatch ? 'Ep ' + epMatch[1] : '',
                    network: network || '',
                    url:     location.href,
                  };
                })()
              `,
            })
            sendResponse({ ok: true, data: results?.[0] as ScrapedMeta ?? null })
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

// ── Install ────────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.storage.local.get([WATCHLIST_KEY])
  if (!existing[WATCHLIST_KEY]) {
    await setWatchlistState({ watchlist: [], activeId: null })
  }
  console.log("[Background] Drama Overlay background worker ready.")
})
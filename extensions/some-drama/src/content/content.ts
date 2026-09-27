// Injected into every tab; resolves its role once at init (the some-mujik
// pattern):
//
//   SOURCE  — a VIDEO_HOSTS tab, where the drama plays. Renders no card (the
//             drama is never on stream). Registers itself with the background,
//             answers GET_PLAYBACK, and logs beats from hotkeys with its own
//             video time.
//   DISPLAY — every other tab. Renders the card from the active entry; this is
//             the page OBS captures. Hotkeys and the mood pickers log beats
//             too (the background asks the source tab for the video time), and
//             every BEAT_LOGGED pulses the live strip.
//
// Display responsibilities:
//   1. Request current state from background (GET_STATE).
//   2. Render DramaCard from the active entry — all fields real, no dummies.
//   3. React to STATE_UPDATE broadcasts from background.
//   4. Persist card position/size locally.
//   5. Log beats (LOG_BEAT); load the episode's beats (GET_BEATS) and pulse
//      the live strip on each BEAT_LOGGED.
//   6. `toggle-visibility` command (Alt+Shift+D, bound via the commons
//      keybinding typestate) — toggle card visibility, or fetch+render if
//      card is null (background was evicted on page load).
//
// Display typestate:
//   LOADING — awaiting first GET_STATE response
//   EMPTY   — no active entry in watchlist
//   READY   — active entry present, card rendered
//
// Bug fixes (see git log):
//   BUG-1  broadcastState skips video tabs, so content.ts never receives
//          STATE_UPDATE on Netflix/YouTube after SET_ACTIVE. Fixed in
//          background.ts by broadcasting to ALL tabs and letting content.ts
//          guard itself.
//   BUG-2  GET_STATE races with background wake-up when the non-persistent
//          background script is evicted. Fixed by extracting fetchAndRender()
//          with a single 300 ms retry on failure.
//   BUG-3  Keybinding was a no-op when card === null (EMPTY typestate after
//          a failed init). Fixed: keybinding calls fetchAndRender() when no
//          card exists instead of silently doing nothing.
//   BUG-4  GET_STATE resolves to the `{ ok, state }` envelope, but the reply
//          was read as a bare WatchlistState — so `watchlist` was always
//          undefined and the card never rendered on page load, only after a
//          popup mutation broadcast STATE_UPDATE. Fixed: requests go through
//          the typed sendMsg and the envelope is unwrapped.

import { DramaCard } from "@drama/components/drama-card"
import { readPlayback } from "@drama/effects/content/playback"
import { sendMsg } from "@drama/effects/messaging"
import { KEY_BINDINGS } from "@drama/logic/content/commands"
import type { DramaCommandId } from "@drama/logic/content/commands"
import { MOODS } from "@drama/logic/content/constants"
import { isVideoHost, VIDEO_HOSTS } from "@drama/logic/video-host"
import type {
  BeatLoggedMessage,
  BeatRecord,
  CardEvents,
  CardSize,
  CardState,
  DramaEntry,
  GetPlaybackMessage,
  MoodType,
  Playback,
  StateUpdateMessage,
  WatchlistState,
} from "@drama/types"
import { attachKeyBindings, isRecord } from "@some-extension/common"
import type { CommandRegistry } from "@some-extension/common"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

// ─── Local types ──────────────────────────────────────────────────────────────

type PersistedCardMeta = {
  x: number
  y: number
  size: CardSize
}

type ContentTypestate =
  | { phase: "LOADING" }
  | { phase: "EMPTY" }
  | { phase: "READY"; entry: DramaEntry }

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = {
  info: (...args: Array<unknown>): void => {
    // eslint-disable-next-line no-console -- sanctioned console sink for the logger module
    console.info("[Drama Overlay / content]", ...args)
  },
  error: (...args: Array<unknown>): void => {
    // eslint-disable-next-line no-console -- sanctioned console sink for the logger module
    console.error("[Drama Overlay / content]", ...args)
  },
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const CARD_META_KEY = "drama_card_position_v3"

function isPersistedCardMeta(v: unknown): v is PersistedCardMeta {
  return (
    isRecord(v) &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.size === "string"
  )
}

function isBeatLoggedMessage(v: unknown): v is BeatLoggedMessage {
  return isRecord(v) && v.type === "BEAT_LOGGED" && isRecord(v.beat)
}

function isGetPlaybackMessage(v: unknown): v is GetPlaybackMessage {
  return isRecord(v) && v.type === "GET_PLAYBACK"
}

function isStateUpdateMessage(v: unknown): v is StateUpdateMessage {
  return isRecord(v) && v.type === "STATE_UPDATE" && isRecord(v.payload)
}

async function loadCardMeta(): Promise<PersistedCardMeta | null> {
  try {
    const r = await browser.storage.local.get(CARD_META_KEY)
    const v = r[CARD_META_KEY]
    return isPersistedCardMeta(v) ? v : null
  } catch {
    return null
  }
}

async function saveCardMeta(meta: PersistedCardMeta): Promise<void> {
  try {
    await browser.storage.local.set({ [CARD_META_KEY]: meta })
  } catch (err) {
    log.error("Failed to save card meta", err)
  }
}

// ─── Position helpers ─────────────────────────────────────────────────────────

const SPAWN_MARGIN = 24

function safeSpawnPosition(
  cardW: number,
  cardH: number
): { x: number; y: number } {
  return {
    x: window.innerWidth - cardW - SPAWN_MARGIN,
    y: window.innerHeight - cardH - SPAWN_MARGIN,
  }
}

// ─── Entry → CardState ────────────────────────────────────────────────────────

function entryToCardState(entry: DramaEntry): CardState {
  return {
    dramaTitle: entry.title || "Unknown Drama",
    posterUrl: entry.posterUrl ?? null,
    episode: entry.episode || "—",
    timestamp: entry.timestamp || "—",
    progress: entry.progress,
    isPlaying: entry.isPlaying,
    overallProgress: entry.overallProgress,
    rating: entry.rating,
    completionLikelihood: entry.completionLikelihood,
    activeMood: entry.activeMood ?? null,
    featuredQuote: entry.featuredQuote || entry.note || "",
    emotionLabel: entry.emotionLabel || entry.genre || "",

    axes: entry.axes,
    transition: entry.transition,
    tags: entry.tags,
    peakLine: entry.peakLine,
    momentum: entry.momentum,
  }
}

// ─── Typestate resolution ─────────────────────────────────────────────────────

function resolveTypestate(
  ws: Partial<WatchlistState> | null | undefined
): ContentTypestate {
  const list = ws?.watchlist ?? []
  const activeId = ws?.activeId ?? null
  const entry = list.find((e) => e.id === activeId) ?? null
  if (!entry) return { phase: "EMPTY" }
  return { phase: "READY", entry }
}

// ─── Empty-state pill ─────────────────────────────────────────────────────────

function renderEmptyPill(
  container: HTMLElement,
  onAutoRemove: () => void
): () => void {
  const SHOW_MS = 4_000
  const FADE_MS = 600

  const pill = document.createElement("div")
  pill.id = "drama-empty-pill"
  pill.className =
    "dc-empty-pill bottom-5 right-5 w-3 h-3 rounded-full pointer-events-none opacity-0"
  container.appendChild(pill)

  // Fade in on next paint
  requestAnimationFrame(() => {
    pill.style.opacity = "0.7"
  })

  let gone = false
  let fadeId: ReturnType<typeof setTimeout> | null = null

  const destroy = (): void => {
    if (gone) return
    gone = true
    if (fadeId !== null) clearTimeout(fadeId)
    pill.remove()
  }

  // Auto-fade out after SHOW_MS, then remove
  const showId = setTimeout(() => {
    pill.style.opacity = "0"
    fadeId = setTimeout(() => {
      destroy()
      onAutoRemove()
    }, FADE_MS)
  }, SHOW_MS)

  // Immediate dismiss (keybinding or re-render)
  return (): void => {
    clearTimeout(showId)
    destroy()
  }
}

// ─── Beats ─────────────────────────────────────────────────────────────────────

/** Log a beat; the background resolves drama, episode and (if null) playback. */
function logBeat(mood: MoodType, playback: Playback | null): void {
  sendMsg({ type: "LOG_BEAT", mood, playback })
    .then((resp) => {
      if (!resp.ok) log.error("LOG_BEAT failed:", resp.error)
    })
    .catch((err: unknown) => log.error("LOG_BEAT failed:", err))
}

/** One `beat:<mood>` command per mood, each reading playback at press time. */
function beatCommands(
  playback: () => Playback | null
): CommandRegistry<DramaCommandId> {
  return Object.fromEntries(
    MOODS.map((m) => [
      `beat:${m.type}`,
      (): void => logBeat(m.type, playback()),
    ])
  )
}

// ─── Source role ──────────────────────────────────────────────────────────────

function initSource(): void {
  log.info("Source tab — no card; logging beats with this tab's video time.")

  const register = (): void => {
    sendMsg({ type: "REGISTER_SOURCE" }).catch((err: unknown) =>
      log.error("REGISTER_SOURCE failed:", err)
    )
  }
  register()
  // Media events don't bubble; capture them at the document. Whichever video
  // tab last started playing is the source (two YouTube tabs: the playing one).
  document.addEventListener("play", register, { capture: true })

  browser.runtime.onMessage.addListener(
    (msg: unknown): Promise<Playback | null> | undefined => {
      if (!isGetPlaybackMessage(msg)) return undefined
      return Promise.resolve(readPlayback())
    }
  )

  // Lifetime: the page's (see the display role below).
  attachKeyBindings(beatCommands(readPlayback), KEY_BINDINGS)
}

// ─── Display role ─────────────────────────────────────────────────────────────

async function initDisplay(): Promise<void> {
  log.info("Initialising display layer…")

  const root = getOverlayRoot()
  const container = document.createElement("div")
  container.id = "drama-card-mount"
  root.appendChild(container)

  let typestate: ContentTypestate = { phase: "LOADING" }
  let card: DramaCard | null = null
  let removeEmptyPill: (() => void) | null = null
  let emptyPillConsumed = false
  let visible: boolean = true
  let currentSize: CardSize = "compact"
  let cardMeta: PersistedCardMeta | null = await loadCardMeta()
  // The active drama's current episode, kept across card re-renders (every
  // STATE_UPDATE rebuilds the card) so the curve never blinks empty.
  let live: {
    dramaId: string
    episode: string
    beats: Array<BeatRecord>
  } | null = null

  // ── Helpers ───────────────────────────────────────────────────────────────

  const currentCardPosition = (): { x: number; y: number } => {
    if (!card) return cardMeta ?? safeSpawnPosition(290, 130)
    const rect = card.root.getBoundingClientRect()
    return { x: rect.left, y: rect.top }
  }

  const destroyCard = (): void => {
    card?.destroy()
    card = null
  }

  const renderCard = (entry: DramaEntry): void => {
    emptyPillConsumed = false
    destroyCard()
    removeEmptyPill?.()
    removeEmptyPill = null

    currentSize = cardMeta?.size ?? "compact"

    const events: CardEvents = {
      onMoodSelect(mood: MoodType): void {
        // Clicked on the card: same path as a hotkey. The BEAT_LOGGED echo
        // pulses the strip.
        logBeat(mood, null)
      },

      onSizeChange(size: CardSize): void {
        currentSize = size
        void saveCardMeta({ ...currentCardPosition(), size })
      },

      onDragEnd(x: number, y: number): void {
        void saveCardMeta({ x, y, size: currentSize })
      },
    }

    card = new DramaCard(container, entryToCardState(entry), events)

    const approxW = currentSize === "full" ? 340 : 290
    const approxH = currentSize === "full" ? 160 : 130
    const spawn = cardMeta
      ? { x: cardMeta.x, y: cardMeta.y }
      : safeSpawnPosition(approxW, approxH)

    card.setPosition(spawn.x, spawn.y)
    if (cardMeta?.size) card.setSize(cardMeta.size, false)
    if (!visible) card.setVisible(false)

    if (live?.dramaId === entry.id) card.setBeats(live.episode, live.beats)
    void loadBeats(entry.id)
  }

  const loadBeats = async (dramaId: string): Promise<void> => {
    try {
      const resp = await sendMsg({ type: "GET_BEATS", dramaId })
      if (!resp.ok) throw new Error(resp.error)
      // The active drama may have changed while the request was in flight.
      if (typestate.phase !== "READY" || typestate.entry.id !== dramaId) return
      live = { dramaId, episode: resp.episode, beats: resp.beats }
      card?.setBeats(resp.episode, resp.beats)
    } catch (err) {
      log.error("GET_BEATS failed:", err)
    }
  }

  const onBeat = (beat: BeatRecord): void => {
    if (typestate.phase !== "READY" || typestate.entry.id !== beat.dramaId) {
      return
    }
    if (live?.dramaId !== beat.dramaId || live.episode !== beat.episode) {
      live = { dramaId: beat.dramaId, episode: beat.episode, beats: [] }
    }
    const i = live.beats.findIndex((b) => b.id === beat.id)
    if (i >= 0) live.beats[i] = beat
    else live.beats.push(beat)
    card?.pushBeat(beat)
  }

  const renderEmpty = (): void => {
    destroyCard()
    if (emptyPillConsumed) return
    emptyPillConsumed = true
    removeEmptyPill?.()
    removeEmptyPill = renderEmptyPill(root, () => {
      removeEmptyPill = null
    })
  }

  // ── fetchAndRender ────────────────────────────────────────────────────────
  // GET_STATE then reconcile. Retries once after 300 ms to handle the race
  // where the non-persistent background script is still waking up.

  const fetchAndRender = async (retryOnFailure = true): Promise<void> => {
    let state: WatchlistState
    try {
      const resp = await sendMsg({ type: "GET_STATE" })
      if (!resp.ok) throw new Error(resp.error)
      state = resp.state
    } catch (err) {
      log.error("GET_STATE failed:", err)
      if (retryOnFailure) {
        await new Promise((r) => setTimeout(r, 300))
        return fetchAndRender(false)
      }
      // Both attempts failed — render empty so the page isn't stuck on LOADING
      renderEmpty()
      return
    }

    const next = resolveTypestate(state)
    if (next.phase === "EMPTY") {
      typestate = next
      renderEmpty()
    } else if (next.phase === "READY") {
      typestate = next
      renderCard(next.entry)
    }
  }

  // ── Initial render ────────────────────────────────────────────────────────

  await fetchAndRender()

  // ── Background message listener ───────────────────────────────────────────

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (isBeatLoggedMessage(msg)) {
      onBeat(msg.beat)
      return
    }
    if (!isStateUpdateMessage(msg)) return

    const next = resolveTypestate(msg.payload)

    if (next.phase === "EMPTY") {
      typestate = next
      renderEmpty()
      return
    }

    if (next.phase === "READY") {
      const prev = typestate
      const entryChanged =
        prev.phase !== "READY" ||
        prev.entry.id !== next.entry.id ||
        JSON.stringify(prev.entry) !== JSON.stringify(next.entry)

      if (entryChanged) {
        const pos = currentCardPosition()
        cardMeta = { x: pos.x, y: pos.y, size: currentSize }
        typestate = next
        renderCard(next.entry)
      }
    }
  })

  // ── Keybindings ───────────────────────────────────────────────────────────

  // Lifetime: the page's. The card lives until the document unloads, so the
  // disposer is not retained.
  const commands: CommandRegistry<DramaCommandId> = {
    // Display tabs have no video of their own; the background asks the source.
    ...beatCommands(() => null),
    "toggle-visibility": (): void => {
      if (card) {
        visible = !visible
        card.setVisible(visible)
        log.info(`Visibility → ${visible ? "visible" : "hidden"}`)
        return
      }
      if (removeEmptyPill) {
        // EMPTY state — dismiss the pill immediately on keybind
        removeEmptyPill()
        removeEmptyPill = null
        log.info("Empty pill dismissed via keybind")
        return
      }
      // No card, no pill — background was likely evicted on page load.
      // Attempt a fresh fetch; if state is available the card will appear.
      log.info("No card on keybind — attempting fetchAndRender")
      void fetchAndRender()
    },
  }
  attachKeyBindings(commands, KEY_BINDINGS)

  log.info("Display layer ready.", typestate)
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function init(): void {
  if (isVideoHost(location.href, VIDEO_HOSTS)) initSource()
  else void initDisplay()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}

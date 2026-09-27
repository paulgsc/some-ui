// The display role: the card, on every tab that is not the drama's (see
// content.ts for how a tab's role is resolved). Split out of content.ts so it
// can be exercised without running the content script's entry point.

import { DramaCard } from "@drama/components/drama-card"
import { sendMsg } from "@drama/effects/messaging"
import type {
  BeatRecord,
  CardEvents,
  CardSize,
  CardState,
  DramaEntry,
  MoodType,
  Playback,
  WatchlistState,
} from "@drama/types"
import { isRecord } from "@some-extension/common"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

// ─── Local types ──────────────────────────────────────────────────────────────

export type PersistedCardMeta = {
  x: number
  y: number
  size: CardSize
}

type ContentTypestate =
  | { phase: "LOADING" }
  | { phase: "EMPTY" }
  | { phase: "READY"; entry: DramaEntry }

// ─── Logger ───────────────────────────────────────────────────────────────────

export const log = {
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

export async function loadCardMeta(): Promise<PersistedCardMeta | null> {
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
export function logBeat(mood: MoodType, playback: Playback | null): void {
  sendMsg({ type: "LOG_BEAT", mood, playback })
    .then((resp) => {
      if (!resp.ok) log.error("LOG_BEAT failed:", resp.error)
    })
    .catch((err: unknown) => log.error("LOG_BEAT failed:", err))
}

// ─── Display role ─────────────────────────────────────────────────────────────

export type Display = {
  apply: (state: WatchlistState) => void
  onBeat: (beat: BeatRecord) => void
  toggleVisibility: () => void
  destroy: () => void
}

export type DisplayDeps = {
  /** Last known card layout — survives the display being torn down. */
  cardMeta: PersistedCardMeta | null
  onCardMeta: (meta: PersistedCardMeta) => void
  /** Called by toggle-visibility when there is nothing on screen to toggle. */
  refetch: () => void
}

export function createDisplay(deps: DisplayDeps): Display {
  log.info("Display tab — rendering the card.")

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
  let cardMeta: PersistedCardMeta | null = deps.cardMeta
  // The active drama's current episode, kept across card re-renders (every
  // STATE_UPDATE rebuilds the card) so the curve never blinks empty.
  let live: {
    dramaId: string
    episode: string
    beats: Array<BeatRecord>
  } | null = null

  // ── Helpers ───────────────────────────────────────────────────────────────

  const persist = (meta: PersistedCardMeta): void => {
    cardMeta = meta
    deps.onCardMeta(meta)
    void saveCardMeta(meta)
  }

  const currentCardPosition = (): { x: number; y: number } => {
    if (!card) return cardMeta ?? safeSpawnPosition(290, 130)
    const rect = card.root.getBoundingClientRect()
    return { x: rect.left, y: rect.top }
  }

  const destroyCard = (): void => {
    card?.destroy()
    card = null
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
        persist({ ...currentCardPosition(), size })
      },

      onDragEnd(x: number, y: number): void {
        persist({ x, y, size: currentSize })
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

  const renderEmpty = (): void => {
    destroyCard()
    if (emptyPillConsumed) return
    emptyPillConsumed = true
    removeEmptyPill?.()
    removeEmptyPill = renderEmptyPill(root, () => {
      removeEmptyPill = null
    })
  }

  return {
    apply(state: WatchlistState): void {
      const next = resolveTypestate(state)

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
          if (card) {
            const pos = currentCardPosition()
            cardMeta = { x: pos.x, y: pos.y, size: currentSize }
          }
          typestate = next
          renderCard(next.entry)
        }
      }
    },

    onBeat(beat: BeatRecord): void {
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
    },

    toggleVisibility(): void {
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
      log.info("No card on keybind — refetching state")
      deps.refetch()
    },

    destroy(): void {
      destroyCard()
      removeEmptyPill?.()
      removeEmptyPill = null
      container.remove()
    },
  }
}

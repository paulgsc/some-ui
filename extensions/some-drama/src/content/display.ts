// The display role: the card, on every tab that is not the drama's (see
// content.ts for how a tab's role is resolved). Split out of content.ts so it
// can be exercised without running the content script's entry point.

import { DramaCard } from "@drama/components/drama-card"
import { sendMsg } from "@drama/effects/messaging"
import { applyBeat } from "@drama/logic/beats"
import type {
  BeatRecord,
  CardEvents,
  CardSize,
  CardState,
  DramaEntry,
  MoodType,
  Playback,
  VerdictChange,
  VerdictField,
  VerdictRecord,
  WatchlistState,
} from "@drama/types"
import {
  Disposables,
  isPageShowing,
  isRecord,
  watchPageShowing,
} from "@some-extension/common"
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

// ─── Position ─────────────────────────────────────────────────────────────────

// Where a card with no saved position mounts: the top-left corner. The card
// grows downward (title pill, live strip, card, and the check-in panel when
// open), so anchoring at the top keeps it on screen whatever its height; the
// bottom-right spawn it replaces guessed that height and regularly guessed
// short, leaving the card clipped past the viewport's bottom edge.
export const DEFAULT_SPAWN = { x: 24, y: 24 } as const

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

// ─── Verdicts ─────────────────────────────────────────────────────────────────

/** Change the active drama's rating or likelihood to finish. */
export function adjustVerdict(
  field: VerdictField,
  change: VerdictChange
): void {
  sendMsg({ type: "ADJUST_VERDICT", field, change })
    .then((resp) => {
      if (!resp.ok) log.error("ADJUST_VERDICT failed:", resp.error)
    })
    .catch((err: unknown) => log.error("ADJUST_VERDICT failed:", err))
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
  // A card exists only while the page is showing (Charter §7): a background
  // tab keeps the latest state and position, but builds nothing and asks for
  // nothing until it is shown. Watched for as long as this display lives.
  const life = new Disposables()
  let showing = isPageShowing()

  // ── Helpers ───────────────────────────────────────────────────────────────

  const persist = (meta: PersistedCardMeta): void => {
    cardMeta = meta
    deps.onCardMeta(meta)
    void saveCardMeta(meta)
  }

  const currentCardPosition = (): { x: number; y: number } => {
    if (!card) return cardMeta ?? DEFAULT_SPAWN
    const rect = card.root.getBoundingClientRect()
    return { x: rect.left, y: rect.top }
  }

  const destroyCard = (): void => {
    card?.destroy()
    card = null
  }

  // Beats broadcast while a GET_BEATS is in flight, one buffer per request:
  // the reply is a snapshot read before them, so they are applied on top of
  // it rather than lost to it.
  const arrivedDuringLoad = new Set<Array<BeatRecord>>()

  const loadBeats = async (dramaId: string): Promise<void> => {
    const arrived: Array<BeatRecord> = []
    arrivedDuringLoad.add(arrived)
    try {
      const resp = await sendMsg({ type: "GET_BEATS", dramaId })
      if (!resp.ok) throw new Error(resp.error)
      // The active drama may have changed while the request was in flight.
      if (typestate.phase !== "READY" || typestate.entry.id !== dramaId) return
      const current = arrived.reduce(applyBeat, {
        episode: resp.episode,
        beats: resp.beats,
      })
      live = { dramaId, ...current }
      card?.setBeats(current.episode, current.beats)
    } catch (err) {
      log.error("GET_BEATS failed:", err)
    } finally {
      arrivedDuringLoad.delete(arrived)
    }
  }

  // The active drama's verdict history, kept across rebuilds like `live`.
  let history: { dramaId: string; verdicts: Array<VerdictRecord> } | null = null

  // Each verdict change starts a read; replies can land out of order, and
  // only the latest read's reply is current.
  let verdictReads = 0

  const loadVerdicts = async (dramaId: string): Promise<void> => {
    const read = ++verdictReads
    try {
      const resp = await sendMsg({ type: "GET_VERDICTS", dramaId })
      if (!resp.ok) throw new Error(resp.error)
      if (read !== verdictReads) return
      if (typestate.phase !== "READY" || typestate.entry.id !== dramaId) return
      history = { dramaId, verdicts: resp.verdicts }
      card?.setVerdictLog(resp.verdicts)
    } catch (err) {
      log.error("GET_VERDICTS failed:", err)
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

      onVerdict(field: VerdictField, change: VerdictChange): void {
        // The STATE_UPDATE echo updates the card in place and spotlights it.
        adjustVerdict(field, change)
      },
    }

    card = new DramaCard(container, entryToCardState(entry), events)

    // A saved position is from whatever window saved it; the card fits it
    // into this one (DramaCard.fit), measuring its real size.
    const spawn = cardMeta ? { x: cardMeta.x, y: cardMeta.y } : DEFAULT_SPAWN
    card.setPosition(spawn.x, spawn.y)
    if (cardMeta?.size) card.setSize(cardMeta.size, false)
    if (!visible) card.setVisible(false)

    if (live?.dramaId === entry.id) card.setBeats(live.episode, live.beats)
    void loadBeats(entry.id)
    if (history?.dramaId === entry.id) card.setVerdictLog(history.verdicts)
    void loadVerdicts(entry.id)
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

  watchPageShowing(life, (now) => {
    showing = now
    if (!now) {
      if (card) {
        const pos = currentCardPosition()
        cardMeta = { x: pos.x, y: pos.y, size: currentSize }
      }
      destroyCard()
      removeEmptyPill?.()
      removeEmptyPill = null
    } else if (typestate.phase === "READY") {
      renderCard(typestate.entry)
    }
  })

  return {
    apply(state: WatchlistState): void {
      const next = resolveTypestate(state)

      if (next.phase === "EMPTY") {
        typestate = next
        if (showing) renderEmpty()
        else destroyCard()
        return
      }

      if (next.phase === "READY") {
        const prev = typestate
        const entryChanged =
          prev.phase !== "READY" ||
          prev.entry.id !== next.entry.id ||
          JSON.stringify(prev.entry) !== JSON.stringify(next.entry)

        if (!entryChanged) return
        const sameDrama =
          prev.phase === "READY" && prev.entry.id === next.entry.id
        typestate = next
        if (card && sameDrama) {
          // The same drama, edited: update the card in place. A rebuild would
          // replay the entrance and lose the spotlight the edit earns.
          card.update(entryToCardState(next.entry))
          // A verdict moved: the background logged it before broadcasting.
          if (
            prev.entry.rating !== next.entry.rating ||
            prev.entry.completionLikelihood !== next.entry.completionLikelihood
          ) {
            void loadVerdicts(next.entry.id)
          }
          return
        }
        if (card) {
          const pos = currentCardPosition()
          cardMeta = { x: pos.x, y: pos.y, size: currentSize }
        }
        if (showing) renderCard(next.entry)
      }
    },

    onBeat(beat: BeatRecord): void {
      if (typestate.phase !== "READY" || typestate.entry.id !== beat.dramaId) {
        return
      }
      for (const arrived of arrivedDuringLoad) arrived.push(beat)
      const base =
        live?.dramaId === beat.dramaId
          ? live
          : { episode: beat.episode, beats: [] }
      live = { dramaId: beat.dramaId, ...applyBeat(base, beat) }
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
      life.dispose()
      destroyCard()
      removeEmptyPill?.()
      removeEmptyPill = null
      container.remove()
    },
  }
}

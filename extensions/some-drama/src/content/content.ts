/* eslint-disable no-console */

// Display consumer only. No video detection, no scraping, no watchlist mutations.
//
// Responsibilities:
//   1. Request current state from background (GET_STATE).
//   2. Render DramaCard from the active entry — all fields real, no dummies.
//   3. React to STATE_UPDATE broadcasts from background.
//   4. Persist card position/size locally.
//   5. Forward mood captures to background (SAVE_MOMENT).
//   6. Keybinding: Alt+Shift+D — toggle card visibility, or fetch+render if
//      card is null (background was evicted on page load).
//
// Typestate:
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

import "@drama/styles/content.css"

import { DramaCard } from "@drama/components/drama-card"
import { installKeybindings } from "@drama/lib/content/keybindings"
import type {
  CardEvents,
  CardSize,
  CardState,
  DramaEntry,
  MomentRecord,
  MoodType,
  WatchlistState,
} from "@drama/types"
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
  info: (...args: Array<unknown>): void =>
    console.info("[Drama Overlay / content]", ...args),
  error: (...args: Array<unknown>): void =>
    console.error("[Drama Overlay / content]", ...args),
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const CARD_META_KEY = "drama_card_position_v3"

async function loadCardMeta(): Promise<PersistedCardMeta | null> {
  try {
    const r = await browser.storage.local.get(CARD_META_KEY)
    return r[CARD_META_KEY] as PersistedCardMeta
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

    axes: entry.axes ?? { connection: 0, hope: 0, trust: 0, control: 0 },
    transition: entry.transition ?? { before: "", after: "" },
    tags: entry.tags ?? [],
    peakLine: entry.peakLine ?? "",
    momentum: entry.momentum ?? { value: 50, direction: "steady" },
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

function renderEmptyPill(container: HTMLElement): () => void {
  const pill = document.createElement("div")
  pill.id = "drama-empty-pill"
  Object.assign(pill.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    background: "hsl(25 25% 15% / 0.92)",
    border: "1.5px solid hsl(340 50% 55% / 0.4)",
    borderRadius: "999px",
    padding: "8px 16px",
    fontFamily: "Georgia, serif",
    fontStyle: "italic",
    fontSize: "12px",
    color: "hsl(30 15% 60%)",
    pointerEvents: "none",
    opacity: "0.7",
  })
  pill.textContent = "no drama active — open popup on video tab"
  container.appendChild(pill)
  return () => pill.remove()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  log.info("Initialising display layer…")

  const root = getOverlayRoot()
  const container = document.createElement("div")
  container.id = "drama-card-mount"
  root.appendChild(container)

  let typestate: ContentTypestate = { phase: "LOADING" }
  let card: DramaCard | null = null
  let removeEmptyPill: (() => void) | null = null
  let visible: boolean = true
  let currentSize: CardSize = "compact"
  let cardMeta: PersistedCardMeta | null = await loadCardMeta()

  // ── Helpers ───────────────────────────────────────────────────────────────

  const currentCardPosition = (): { x: number; y: number } => {
    if (!card) return cardMeta ?? safeSpawnPosition(290, 130)
    const rect = (
      card as unknown as { root: HTMLElement }
    ).root?.getBoundingClientRect?.()
    return rect
      ? { x: rect.left, y: rect.top }
      : (cardMeta ?? safeSpawnPosition(290, 130))
  }

  const destroyCard = (): void => {
    card?.destroy()
    card = null
  }

  const renderCard = (entry: DramaEntry): void => {
    destroyCard()
    removeEmptyPill?.()
    removeEmptyPill = null

    currentSize = cardMeta?.size ?? "compact"

    const events: CardEvents = {
      onMoodSelect(mood: MoodType): void {
        const moment: MomentRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: 0,
          mood,
          episodeId: entry.episode,
          dramaTitle: entry.title,
          capturedAt: Date.now(),
        }
        browser.runtime
          .sendMessage({ type: "SAVE_MOMENT", payload: moment })
          .catch((err) => log.error("SAVE_MOMENT failed:", err))

        card?.update({ activeMood: mood })
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
  }

  const renderEmpty = (): void => {
    destroyCard()
    removeEmptyPill?.()
    removeEmptyPill = renderEmptyPill(root)
  }

  // ── fetchAndRender ────────────────────────────────────────────────────────
  // GET_STATE then reconcile. Retries once after 300 ms to handle the race
  // where the non-persistent background script is still waking up.

  const fetchAndRender = async (retryOnFailure = true): Promise<void> => {
    let state: WatchlistState | null = null
    try {
      state = await browser.runtime.sendMessage({ type: "GET_STATE" })
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
    const m = msg as { type: string; payload?: Partial<WatchlistState> }
    if (m.type !== "STATE_UPDATE" || !m.payload) return

    const next = resolveTypestate(m.payload)

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

  installKeybindings({
    toggleVisibility(): void {
      if (card) {
        visible = !visible
        card.setVisible(visible)
        log.info(`Visibility → ${visible ? "visible" : "hidden"}`)
        return
      }
      // No card — background was likely evicted on page load.
      // Attempt a fresh fetch; if state is available the card will appear.
      log.info("No card on keybind — attempting fetchAndRender")
      void fetchAndRender()
    },
  })

  log.info("Display layer ready.", typestate)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init())
} else {
  void init()
}

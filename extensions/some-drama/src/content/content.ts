/* eslint-disable no-console */

// ── content.ts ────────────────────────────────────────────────────────────────
// PATCH #2 REWRITE:
//   This script now runs on any NON-video tab (excluded in manifest).
//   It is purely a display consumer — it owns NO video detection, NO
//   heuristic scraping, and NO watchlist mutations.
//
//   Responsibilities:
//     1. On mount: request current state from background (GET_STATE).
//     2. Render the DramaCard from persisted active entry.
//     3. Listen for STATE_UPDATE messages broadcast by background when
//        the user edits the watchlist via the popup.
//     4. Persist card position/size locally (unchanged from original).
//     5. Mood capture still works — saves a moment to background storage.
//     6. Keybinding: Ctrl+Shift+M then K → toggle card visibility.
//        (See keybindings.ts for the chord implementation.)
//
//   Typestate: the card can be in one of:
//     LOADING   — awaiting first GET_STATE response
//     EMPTY     — state received but watchlist empty / no active entry
//     READY     — active entry exists, card rendered
//
//   On EMPTY the card is hidden and a subtle "no drama active" pill is shown.

import "@drama/styles/content.css"

import { DramaCard } from "@drama/components/drama-card"
import { installKeybindings } from "@drama/lib/content/keybindings"
import type { CardEvents, CardSize, CardState, MoodType } from "@drama/types"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

// ─── Inline types (no shared chunks) ────────────────────────────────────────

type DramaEntry = {
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

type WatchlistState = {
  watchlist: Array<DramaEntry>
  activeId: string | null
}

type PersistedCardMeta = {
  x: number
  y: number
  size: CardSize
}

type ContentTypestate =
  | { phase: "LOADING" }
  | { phase: "EMPTY" }
  | { phase: "READY"; entry: DramaEntry }

// ─── Logger ─────────────────────────────────────────────────────────────────

const log = {
  info: (...args: Array<unknown>): void =>
    console.info("[Drama Overlay / content]", ...args),
  error: (...args: Array<unknown>): void =>
    console.error("[Drama Overlay / content]", ...args),
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const CARD_META_KEY = "drama_card_position_v3"

async function loadCardMeta(): Promise<PersistedCardMeta | null> {
  try {
    const r = await browser.storage.local.get(CARD_META_KEY)
    return (r[CARD_META_KEY] as PersistedCardMeta) ?? null
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

/**
 * Safe initial position: bottom-right corner, within viewport.
 * Called before the entrance animation fires to avoid the off-screen flash.
 */
function safeSpawnPosition(
  cardW: number,
  cardH: number
): { x: number; y: number } {
  return {
    x: window.innerWidth - cardW - SPAWN_MARGIN,
    y: window.innerHeight - cardH - SPAWN_MARGIN,
  }
}

// ─── Entry → CardState mapping ────────────────────────────────────────────────

function entryToCardState(entry: DramaEntry): CardState {
  return {
    dramaTitle: entry.title || "Unknown Drama",
    posterUrl: null,
    episode: entry.episode || "—",
    timestamp: "—",
    progress: 0,
    overallProgress: 0,
    rating: 0,
    completionLikelihood: 0.5,
    activeMood: null,
    featuredQuote: entry.note || "",
    emotionLabel: entry.genre || "",
    isPlaying: false,
  }
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

  // ── Resolve active entry ──────────────────────────────────────────────────
  let state: WatchlistState | null = null
  try {
    state = await browser.runtime.sendMessage({
      type: "GET_STATE",
    })
  } catch (err) {
    log.error("GET_STATE failed:", err)
    // Background not ready — treat as empty for now; STATE_UPDATE will arrive
  }

  const root = getOverlayRoot()

  // Container is just a DOM anchor — #dc-root inside DramaCard is the actual
  // fixed element. We do NOT set position styles on the container itself,
  // which was a second-fixed-ancestor bug in the original code.
  const container = document.createElement("div")
  container.id = "drama-card-mount"
  root.appendChild(container)

  // ── Typestate resolution ──────────────────────────────────────────────────
  const resolveTypestate = (
    ws: Partial<WatchlistState> | null | undefined
  ): ContentTypestate => {
    // If the background state is completely broken, malformed, or missing a watchlist, fail-soft to EMPTY
    const list = ws?.watchlist ?? []
    const activeId = ws?.activeId ?? null

    const entry = list.find((e) => e?.id === activeId) ?? null
    if (!entry) return { phase: "EMPTY" }
    return { phase: "READY", entry }
  }

  let typestate = resolveTypestate(state)
  let card: DramaCard | null = null
  let removeEmptyPill: (() => void) | null = null
  let visible = true
  let currentSize: CardSize = "compact"
  let cardMeta = await loadCardMeta()

  // ── Render helpers ────────────────────────────────────────────────────────

  const destroyCard = (): void => {
    card?.destroy()
    card = null
  }

  const renderCard = (entry: DramaEntry): void => {
    destroyCard()
    removeEmptyPill?.()
    removeEmptyPill = null

    const cardState = entryToCardState(entry)
    currentSize = cardMeta?.size ?? "compact"

    const events: CardEvents = {
      onMoodSelect(mood: MoodType): void {
        const moment = {
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

    card = new DramaCard(container, cardState, events)

    // Apply persisted or safe-spawn position BEFORE the entrance animation
    // so the card never flashes at the CSS default (now off-screen -9999px).
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

  // ── Helper to read last known card position ───────────────────────────────
  const currentCardPosition = (): { x: number; y: number } => {
    if (!card) return cardMeta ?? safeSpawnPosition(290, 130)
    const rect = (
      card as unknown as { root: HTMLElement }
    ).root?.getBoundingClientRect?.()
    return rect
      ? { x: rect.left, y: rect.top }
      : (cardMeta ?? safeSpawnPosition(290, 130))
  }

  // ── Initial render ────────────────────────────────────────────────────────
  switch (typestate.phase) {
    case "LOADING":
    case "EMPTY":
      renderEmpty()
      break
    case "READY":
      renderCard(typestate.entry)
      break
  }

  // ── Background message listener ───────────────────────────────────────────
  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as { type: string; payload?: Partial<WatchlistState> }
    if (m.type !== "STATE_UPDATE" || !m.payload) return

    const next = resolveTypestate(m.payload)

    if (next.phase === "EMPTY") {
      typestate = next
      renderEmpty()
    } else if (next.phase === "READY") {
      // Re-render only if entry changed (id differs or data changed)
      const prev = typestate
      const entryChanged =
        prev.phase !== "READY" ||
        prev.entry.id !== next.entry.id ||
        JSON.stringify(prev.entry) !== JSON.stringify(next.entry)

      if (entryChanged) {
        // Persist current position before teardown
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
      visible = !visible
      if (card) {
        card.setVisible(visible)
      } else if (removeEmptyPill) {
        // Toggle the empty pill too
        const pill = document.getElementById("drama-empty-pill")
        if (pill) pill.style.opacity = visible ? "0.7" : "0"
      }
      log.info(`Card visibility toggled → ${visible ? "visible" : "hidden"}`)
    },
  })

  log.info("Display layer ready.", typestate)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init())
} else {
  void init()
}

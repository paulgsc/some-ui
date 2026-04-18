// content.ts — logic layer for Drama Sentiment Tracker
// Drives SentimentWidget (pure UI) with all runtime detection + storage bridging.
// Zero shared chunks: all types inlined.

import "../components/drama-tracker/index.css"

import {
  SentimentWidget,
  type EmotionType,
  type WidgetEvents,
  type WidgetState,
} from "../components/drama-tracker/sentiment-widget"

// ─── Types (inlined) ─────────────────────────────────────────────────────────

type CapturedMoment = {
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

type DramaContext = {
  dramaTitle: string
  episodeId: string // "Ep 8"
  episodeRaw: string // "ep-8" — used as storage key segment
}

type PersistedWidgetMeta = {
  x: number
  y: number
  size: "min" | "compact" | "full"
}

// ─── Emoji map (parallel to widget's EMOTIONS) ────────────────────────────────

const EMOTION_EMOJI: Record<EmotionType, string> = {
  joy: "😊",
  love: "😍",
  sadness: "😭",
  rage: "😡",
  fear: "😱",
  neutral: "😐",
}

// ─── Drama context detection ─────────────────────────────────────────────────

/**
 * Platform-aware title + episode extraction.
 * Falls back to document.title parsing for unknown hosts.
 */
function detectDramaContext(): DramaContext {
  const host = window.location.hostname

  // Netflix
  if (host.includes("netflix.com")) {
    const titleEl =
      document.querySelector<HTMLElement>(".video-title h4") ??
      document.querySelector<HTMLElement>("[data-uia='video-title']")
    const episodeEl =
      document.querySelector<HTMLElement>("[data-uia='current-episode']") ??
      document.querySelector<HTMLElement>(".ellipsize-text span")
    const raw = titleEl?.textContent?.trim() ?? document.title
    const epRaw = episodeEl?.textContent?.trim() ?? ""
    return makeContext(raw, epRaw)
  }

  // Viki
  if (host.includes("viki.com")) {
    const titleEl = document.querySelector<HTMLElement>(
      ".episode-title, .show-title"
    )
    const epEl = document.querySelector<HTMLElement>(".episode-number")
    const raw = titleEl?.textContent?.trim() ?? document.title
    const epRaw = epEl?.textContent?.trim() ?? ""
    return makeContext(raw, epRaw)
  }

  // Kocowa / Viu / WeTV — add more here
  // if (host.includes("viu.com")) { … }

  // Generic fallback — parse document.title
  return makeContext(document.title, "")
}

/**
 * Regex-based episode extraction from combined title strings.
 * Handles: "Show Name - Episode 8", "Show Name EP.8", "Show Name Ep 08", etc.
 */
function makeContext(rawTitle: string, rawEpisode: string): DramaContext {
  // Try explicit episode string first
  let epMatch = rawEpisode.match(/\d+/)

  // Fall back to parsing the title itself
  if (!epMatch) {
    epMatch = rawTitle.match(/(?:ep(?:isode)?\.?\s*)(\d+)/i)
  }

  const epNum = epMatch ? epMatch[1] : null

  // Strip episode segment from title for cleaner display
  const dramaTitle =
    rawTitle
      .replace(/[-–|]\s*ep(isode)?\.?\s*\d+.*/i, "")
      .replace(/\s*ep(isode)?\.?\s*\d+\s*/i, "")
      .replace(/\s*\(\d{4}\)\s*/, "") // strip year
      .trim() || "Unknown Drama"

  const episodeId = epNum ? `Ep ${epNum}` : "—"
  const episodeRaw = epNum ? `ep-${epNum}` : "ep-unknown"

  return { dramaTitle, episodeId, episodeRaw }
}

// ─── Video detection ──────────────────────────────────────────────────────────

function findVideo(): HTMLVideoElement | null {
  const videos = Array.from(
    document.querySelectorAll<HTMLVideoElement>("video")
  )
  // Prefer the longest-duration video (most likely the main episode)
  return videos.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0] ?? null
}

function formatTimestamp(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ─── Storage bridge ───────────────────────────────────────────────────────────

async function persistMoment(moment: CapturedMoment): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: "SAVE_MOMENT", payload: moment })
  } catch (err) {
    console.error("[Drama Sentiment] Failed to save moment:", err)
  }
}

const META_KEY = "drama_widget_meta"

async function loadWidgetMeta(): Promise<PersistedWidgetMeta | null> {
  try {
    const result = await browser.storage.local.get(META_KEY)
    return (result[META_KEY] as PersistedWidgetMeta | undefined) ?? null
  } catch {
    return null
  }
}

async function saveWidgetMeta(meta: PersistedWidgetMeta): Promise<void> {
  try {
    await browser.storage.local.set({ [META_KEY]: meta })
  } catch {
    // non-critical
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  console.log("[Drama Sentiment] Initializing…")

  // Wait for a video element — retry up to 10s
  let video = findVideo()
  let attempts = 0
  while (!video && attempts < 20) {
    await new Promise((r) => setTimeout(r, 500))
    video = findVideo()
    attempts++
  }

  if (!video) {
    console.log("[Drama Sentiment] No <video> found — aborting.")
    return
  }

  const ctx = detectDramaContext()
  console.log("[Drama Sentiment] Initialized", ctx)

  // ─── Widget container ──────────────────────────────────────────────────────
  const container = document.createElement("div")
  container.id = "drama-sentiment-root"
  // Base positioning — will be overridden by persisted drag position
  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
    bottom: "80px",
    zIndex: "2147483646",
    fontFamily: "system-ui, sans-serif",
  })
  document.body.appendChild(container)

  // ─── Initial widget state ──────────────────────────────────────────────────
  const initialState: WidgetState = {
    dramaTitle: ctx.dramaTitle,
    episode: ctx.episodeId,
    timestamp: formatTimestamp(video.currentTime),
    progress: video.duration > 0 ? video.currentTime / video.duration : 0,
    activeEmotion: null,
    intensity: 0.7,
    isPlaying: !video.paused,
  }

  // ─── Events wired to logic layer ──────────────────────────────────────────
  const events: WidgetEvents = {
    onEmotionSelect(emotion, intensity, note) {
      const v = findVideo()
      const ts = v?.currentTime ?? 0
      const moment: CapturedMoment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: ts,
        emotion,
        intensity,
        emoji: EMOTION_EMOJI[emotion],
        note: note || undefined,
        episodeId: ctx.episodeRaw,
        dramaTitle: ctx.dramaTitle,
        capturedAt: Date.now(),
      }
      void persistMoment(moment)
      console.log(
        "[Drama Sentiment] Captured:",
        emotion,
        "@",
        formatTimestamp(ts),
        note || ""
      )
    },

    onSizeChange(size) {
      void saveWidgetMeta({
        x: parseFloat(widget.root?.style.left ?? "-1"),
        y: parseFloat(widget.root?.style.top ?? "-1"),
        size,
      })
    },

    onDragEnd(x, y) {
      void saveWidgetMeta({ x, y, size: "compact" })
    },
  }

  const widget = new SentimentWidget(container, initialState, events)

  // ─── Restore persisted position / size ────────────────────────────────────
  const meta = await loadWidgetMeta()
  if (meta) {
    if (meta.x >= 0 && meta.y >= 0) {
      widget.setPosition(meta.x, meta.y)
    }
    if (meta.size) {
      widget.setSize(meta.size, false)
    }
  }

  // ─── State sync loop ───────────────────────────────────────────────────────
  // Runs on rAF while tab is active; falls back to 1s interval when hidden.
  let rafId: number | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function tick(): void {
    const v = findVideo()
    if (!v) return

    const freshCtx = detectDramaContext()

    widget.update({
      dramaTitle: freshCtx.dramaTitle,
      episode: freshCtx.episodeId,
      timestamp: formatTimestamp(v.currentTime),
      progress: v.duration > 0 ? v.currentTime / v.duration : 0,
      isPlaying: !v.paused,
    })
  }

  function startRaf(): void {
    if (rafId !== null) return
    const loop = (): void => {
      tick()
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
  }

  function stopRaf(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRaf()
      intervalId = setInterval(tick, 1000)
    } else {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      startRaf()
    }
  })

  startRaf()

  // ─── Fullscreen sync ───────────────────────────────────────────────────────
  document.addEventListener("fullscreenchange", () => {
    // Keep widget visible in fullscreen by re-parenting to fullscreen element
    const fs = document.fullscreenElement
    if (fs && fs !== document.body) {
      fs.appendChild(container)
    } else {
      document.body.appendChild(container)
    }
    widget.setVisible(true)
  })

  // ─── Video events → widget ────────────────────────────────────────────────
  video.addEventListener("play", () => widget.update({ isPlaying: true }))
  video.addEventListener("pause", () => widget.update({ isPlaying: false }))

  // Re-detect context on URL change (SPA navigation)
  let lastHref = location.href
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href
      const newCtx = detectDramaContext()
      widget.update({
        dramaTitle: newCtx.dramaTitle,
        episode: newCtx.episodeId,
      })
    }
  })
  navObserver.observe(document.body, { childList: true, subtree: true })

  console.log("[Drama Sentiment] Running.")
}

// Kick off after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init())
} else {
  void init()
}

export {}

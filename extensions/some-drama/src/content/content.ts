// — logic layer for some-drama overlay
// Drives DramaCard (pure UI) with runtime detection + storage bridging.
// Zero shared chunks: all types inlined.

import "@drama/components/drama-tracker/index.css"

import type {
  CardEvents,
  CardSize,
  CardState,
  MoodType,
} from "@drama/components/drama-tracker"
import { DramaCard } from "@drama/components/drama-tracker"

// ─── Types (inlined) ──────────────────────────────────────────────

type CapturedMood = {
  id: string
  timestamp: number
  mood: MoodType
  episodeId: string
  dramaTitle: string
  capturedAt: number
}

type DramaContext = {
  dramaTitle: string
  episodeId: string // "Ep 8"
  episodeNum: number // 8
  totalEps: number // 24 (best-effort)
  episodeRaw: string // "ep-8"
}

type PersistedMeta = {
  x: number
  y: number
  size: CardSize
  rating: number
  completionLikelihood: number
  featuredQuote: string
  emotionLabel: string
  overallProgress: number
}

// ─── Drama context detection ──────────────────────────────────────

function detectDramaContext(): DramaContext {
  const host = window.location.hostname

  let rawTitle = ""
  let rawEpisode = ""

  if (host.includes("netflix.com")) {
    rawTitle =
      document
        .querySelector<HTMLElement>(".video-title h4, [data-uia='video-title']")
        ?.textContent?.trim() ?? ""
    rawEpisode =
      document
        .querySelector<HTMLElement>("[data-uia='current-episode']")
        ?.textContent?.trim() ?? ""
  } else if (host.includes("viki.com")) {
    rawTitle =
      document
        .querySelector<HTMLElement>(".episode-title, .show-title")
        ?.textContent?.trim() ?? ""
    rawEpisode =
      document
        .querySelector<HTMLElement>(".episode-number")
        ?.textContent?.trim() ?? ""
  } else if (host.includes("youtube.com")) {
    rawTitle =
      document
        .querySelector<HTMLElement>("h1.ytd-watch-metadata, h1.title")
        ?.textContent?.trim() ?? document.title
  }

  if (!rawTitle) rawTitle = document.title

  return parseContext(rawTitle, rawEpisode)
}

function parseContext(rawTitle: string, rawEpisode: string): DramaContext {
  let epNum: number | null = null

  const epFromStr = rawEpisode.match(/\d+/)
  if (epFromStr) epNum = parseInt(epFromStr[0], 10)

  if (!epNum) {
    const fromTitle = rawTitle.match(/(?:ep(?:isode)?\.?\s*)(\d+)/i)
    if (fromTitle) epNum = parseInt(fromTitle[1], 10)
  }

  // Try to detect total episode count from patterns like "Ep 8/24" or "8화/16화"
  let totalEps = 0
  const totalMatch = rawTitle.match(/(?:\/|of)\s*(\d+)/)
  if (totalMatch) totalEps = parseInt(totalMatch[1], 10)

  const dramaTitle =
    rawTitle
      .replace(/[-–|]\s*ep(isode)?\.?\s*\d+.*/i, "")
      .replace(/\s*ep(isode)?\.?\s*\d+\s*/i, "")
      .replace(/\s*\(\d{4}\)\s*/, "")
      .trim() || "Unknown Drama"

  const episodeId = epNum ? `Ep ${epNum}` : "—"
  const episodeRaw = epNum ? `ep-${epNum}` : "ep-unknown"

  return { dramaTitle, episodeId, episodeNum: epNum ?? 0, totalEps, episodeRaw }
}

// ─── Video helpers ────────────────────────────────────────────────

function findVideo(): HTMLVideoElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLVideoElement>("video")).sort(
      (a, b) => (b.duration || 0) - (a.duration || 0)
    )[0] ?? null
  )
}

function fmt(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function overallProgress(ctx: DramaContext, episodeProgress: number): number {
  if (!ctx.totalEps || !ctx.episodeNum) return episodeProgress * 0.5
  const done = (ctx.episodeNum - 1) / ctx.totalEps
  const inEp = episodeProgress / ctx.totalEps
  return Math.min(1, done + inEp)
}

// Heuristic: completion likelihood rises with overall progress + time invested
function likelihoodHeuristic(overallProg: number, rating: number): number {
  const ratingFactor = rating / 10
  return Math.min(1, overallProg * 0.6 + ratingFactor * 0.4)
}

// ─── Storage ──────────────────────────────────────────────────────

const META_KEY = "drama_card_meta_v2"
const MOOD_KEY = "drama_moods_v2"

async function loadMeta(): Promise<PersistedMeta | null> {
  try {
    const r = await browser.storage.local.get(META_KEY)
    return (r[META_KEY] as PersistedMeta | undefined) ?? null
  } catch {
    return null
  }
}

async function saveMeta(meta: PersistedMeta): Promise<void> {
  try {
    await browser.storage.local.set({ [META_KEY]: meta })
  } catch {}
}

async function saveMood(moment: CapturedMood): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: "SAVE_MOMENT", payload: moment })
  } catch (err) {
    console.error("[Drama Card] Failed to save mood:", err)
  }
}

// ─── Poster URL detection ─────────────────────────────────────────
// Best-effort: grab the OG image or the thumbnail from the page.
function detectPosterUrl(): string | null {
  const og = document.querySelector<HTMLMetaElement>(
    "meta[property='og:image']"
  )
  if (og?.content) return og.content
  const img = document.querySelector<HTMLImageElement>(
    ".ytp-cued-thumbnail-overlay-image, [class*='thumbnail'] img"
  )
  if (img?.src) return img.src
  return null
}

// ─── Main ─────────────────────────────────────────────────────────

async function init(): Promise<void> {
  console.log("[Drama Card] Initializing…")

  // Wait for a video element — retry up to 10s
  let video = findVideo()
  let attempts = 0
  while (!video && attempts < 20) {
    await new Promise((r) => setTimeout(r, 500))
    video = findVideo()
    attempts++
  }

  if (!video) {
    console.log("[Drama Card] No <video> — aborting.")
    return
  }

  const ctx = detectDramaContext()
  console.log("[Drama Card] Context:", ctx)

  // Load persisted meta (rating, quote, likelihood, position)
  const meta = await loadMeta()

  const container = document.createElement("div")
  container.id = "drama-card-mount"
  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
    bottom: "80px",
    zIndex: "2147483646",
  })
  document.body.appendChild(container)

  const epProg = video.duration > 0 ? video.currentTime / video.duration : 0
  const oProg = overallProgress(ctx, epProg)

  const initialState: CardState = {
    dramaTitle: ctx.dramaTitle,
    posterUrl: detectPosterUrl(),
    episode:
      ctx.episodeNum && ctx.totalEps
        ? `Ep ${ctx.episodeNum} / ${ctx.totalEps}`
        : ctx.episodeId,
    timestamp: fmt(video.currentTime),
    progress: epProg,
    overallProgress: meta?.overallProgress ?? oProg,
    rating: meta?.rating ?? 7.5,
    completionLikelihood: meta?.completionLikelihood ?? 0.75,
    activeMood: null,
    featuredQuote: meta?.featuredQuote ?? "",
    emotionLabel: meta?.emotionLabel ?? "enjoying it",
    isPlaying: !video.paused,
  }

  const events: CardEvents = {
    onMoodSelect(mood) {
      const v = findVideo()
      const ts = v?.currentTime ?? 0
      const moment: CapturedMood = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: ts,
        mood,
        episodeId: ctx.episodeRaw,
        dramaTitle: ctx.dramaTitle,
        capturedAt: Date.now(),
      }
      void saveMood(moment)
      // Update emotion label live
      const labels: Record<MoodType, string> = {
        joy: "loving this",
        love: "heart eyes",
        sadness: "crying rn",
        tension: "on edge",
        cringe: "oh no...",
        neutral: "taking it in",
      }
      card.update({ activeMood: mood, emotionLabel: labels[mood] })
      console.log("[Drama Card] Mood captured:", mood, "@", fmt(ts))
    },

    onSizeChange(size) {
      persistCurrentMeta(size)
    },

    onDragEnd(x, y) {
      persistCurrentMeta(card["currentSize"], x, y)
    },
  }

  const card = new DramaCard(container, initialState, events)

  // Restore position / size
  if (meta) {
    if (meta.x >= 0 && meta.y >= 0) card.setPosition(meta.x, meta.y)
    if (meta.size) card.setSize(meta.size, false)
  }

  function persistCurrentMeta(size: CardSize, x?: number, y?: number): void {
    const rect = card.root.getBoundingClientRect()
    void saveMeta({
      x: x ?? rect.left,
      y: y ?? rect.top,
      size,
      rating: card["state"].rating,
      completionLikelihood: card["state"].completionLikelihood,
      featuredQuote: card["state"].featuredQuote,
      emotionLabel: card["state"].emotionLabel,
      overallProgress: card["state"].overallProgress,
    })
  }

  // ─── State sync ────────────────────────────────────────────────
  let rafId: number | null = null

  function tick(): void {
    const v = findVideo()
    if (!v) return
    const freshCtx = detectDramaContext()
    const epP = v.duration > 0 ? v.currentTime / v.duration : 0
    const oP = overallProgress(freshCtx, epP)
    const likelihood = likelihoodHeuristic(oP, card["state"].rating)

    card.update({
      dramaTitle: freshCtx.dramaTitle,
      episode:
        freshCtx.episodeNum && freshCtx.totalEps
          ? `Ep ${freshCtx.episodeNum} / ${freshCtx.totalEps}`
          : freshCtx.episodeId,
      timestamp: fmt(v.currentTime),
      progress: epP,
      overallProgress: oP,
      completionLikelihood: likelihood,
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
      setInterval(tick, 1000)
    } else {
      startRaf()
    }
  })

  startRaf()

  // Fullscreen: re-parent widget
  document.addEventListener("fullscreenchange", () => {
    const fs = document.fullscreenElement
    if (fs && fs !== document.body) fs.appendChild(container)
    else document.body.appendChild(container)
    card.setVisible(true)
  })

  video.addEventListener("play", () => card.update({ isPlaying: true }))
  video.addEventListener("pause", () => card.update({ isPlaying: false }))

  // SPA nav
  let lastHref = location.href
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href
      const c = detectDramaContext()
      card.update({
        dramaTitle: c.dramaTitle,
        episode: c.episodeId,
        posterUrl: detectPosterUrl(),
      })
    }
  }).observe(document.body, { childList: true, subtree: true })

  console.log("[Drama Card] Running.")
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init())
} else {
  void init()
}

export {}

/* eslint-disable no-console */

import "@drama/styles/content.css"

import { DramaCard } from "@drama/components/drama-card"
import type { CardEvents, CardSize, CardState, MoodType } from "@drama/types"
import { getOverlayRoot } from "@some-extension/common/lib/layers"

// ─── Types ──────────────────────────────────────────────

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
  episodeId: string
  episodeNum: number
  totalEps: number
  episodeRaw: string
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

// ─── Logger ─────────────────────────────────────────────

const log = {
  info: (...args: Array<unknown>): void =>
    console.info("[Drama Card]", ...args),
  error: (...args: Array<unknown>): void =>
    console.error("[Drama Card]", ...args),
}

// ─── Context parsing ────────────────────────────────────

function parseContext(rawTitle: string, rawEpisode: string): DramaContext {
  let epNum: number | null = null

  const epFromStr = rawEpisode.match(/\d+/)
  if (epFromStr) epNum = parseInt(epFromStr[0], 10)

  if (!epNum) {
    const fromTitle = rawTitle.match(/(?:ep(?:isode)?\.?\s*)(\d+)/i)
    if (fromTitle) epNum = parseInt(fromTitle[1], 10)
  }

  let totalEps = 0
  const totalMatch = rawTitle.match(/(?:\/|of)\s*(\d+)/)
  if (totalMatch) totalEps = parseInt(totalMatch[1], 10)

  const dramaTitle =
    rawTitle
      .replace(/[-–|]\s*ep(?:isode)?\.?\s*\d+.*/i, "")
      .replace(/\s*ep(?:isode)?\.?\s*\d+\s*/i, "")
      .replace(/\s*\(\d{4}\)\s*/, "")
      .trim() || "Unknown Drama"

  return {
    dramaTitle,
    episodeId: epNum ? `Ep ${epNum}` : "—",
    episodeNum: epNum ?? 0,
    totalEps,
    episodeRaw: epNum ? `ep-${epNum}` : "ep-unknown",
  }
}

function detectDramaContext(): DramaContext {
  const host = window.location.hostname

  let rawTitle = ""
  let rawEpisode = ""

  if (host.includes("netflix.com")) {
    rawTitle =
      document
        .querySelector(".video-title h4, [data-uia='video-title']")
        ?.textContent?.trim() ?? ""
    rawEpisode =
      document
        .querySelector("[data-uia='current-episode']")
        ?.textContent?.trim() ?? ""
  } else if (host.includes("viki.com")) {
    rawTitle =
      document
        .querySelector(".episode-title, .show-title")
        ?.textContent?.trim() ?? ""
    rawEpisode =
      document.querySelector(".episode-number")?.textContent?.trim() ?? ""
  } else if (host.includes("youtube.com")) {
    rawTitle =
      document
        .querySelector("h1.ytd-watch-metadata, h1.title")
        ?.textContent?.trim() ?? document.title
  }

  return parseContext(rawTitle || document.title, rawEpisode)
}

// ─── Video helpers ──────────────────────────────────────

function findVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video"))
  return videos.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0] ?? null
}

function fmt(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function calculateOverallProgress(
  ctx: DramaContext,
  episodeProgress: number
): number {
  if (!ctx.totalEps || !ctx.episodeNum) return episodeProgress * 0.5

  const done = (ctx.episodeNum - 1) / ctx.totalEps
  const inEp = episodeProgress / ctx.totalEps

  return Math.min(1, done + inEp)
}

function likelihoodHeuristic(overallProg: number, rating: number): number {
  return Math.min(1, overallProg * 0.6 + (rating / 10) * 0.4)
}

// ─── Storage ────────────────────────────────────────────

const META_KEY = "drama_card_meta_v2"

async function loadMeta(): Promise<PersistedMeta | null> {
  try {
    const r = await browser.storage.local.get(META_KEY)
    return (r[META_KEY] as PersistedMeta) ?? null
  } catch (err) {
    log.error("Failed to load meta", err)
    return null
  }
}

async function saveMeta(meta: PersistedMeta): Promise<void> {
  try {
    await browser.storage.local.set({ [META_KEY]: meta })
  } catch (err) {
    log.error("Failed to save meta", err)
  }
}

async function saveMood(moment: CapturedMood): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: "SAVE_MOMENT",
      payload: moment,
    })
  } catch (err) {
    log.error("Failed to save mood:", err)
  }
}

function detectPosterUrl(): string | null {
  const og = document.querySelector<HTMLMetaElement>(
    "meta[property='og:image']"
  )
  if (og?.content) return og.content

  const img = document.querySelector<HTMLImageElement>(
    ".ytp-cued-thumbnail-overlay-image, [class*='thumbnail'] img"
  )

  return img?.src ?? null
}

// ─── Main ───────────────────────────────────────────────

async function init(): Promise<void> {
  let video: HTMLVideoElement | null = findVideo()
  let attempts = 0

  while (!video && attempts < 20) {
    await new Promise<void>((r) => setTimeout(r, 500))
    video = findVideo()
    attempts++
  }

  if (!video) {
    log.info("No <video> found — aborting.")
    return
  }

  const ctx = detectDramaContext()
  const meta = await loadMeta()

  const root = getOverlayRoot()
  const container = document.createElement("div")
  container.id = "drama-card-mount"

  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
    bottom: "80px",
    zIndex: "2147483646",
  })

  root.appendChild(container)

  const epProg = video.duration > 0 ? video.currentTime / video.duration : 0

  const oProg = calculateOverallProgress(ctx, epProg)

  let currentSize: CardSize = meta?.size ?? "compact"

  let internalState: CardState = {
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

  const persistCurrentMeta = (size: CardSize, x?: number, y?: number): void => {
    const rect = container.getBoundingClientRect()

    void saveMeta({
      x: x ?? rect.left,
      y: y ?? rect.top,
      size,
      rating: internalState.rating,
      completionLikelihood: internalState.completionLikelihood,
      featuredQuote: internalState.featuredQuote,
      emotionLabel: internalState.emotionLabel,
      overallProgress: internalState.overallProgress,
    })
  }

  const events: CardEvents = {
    onMoodSelect(mood: MoodType): void {
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

      const labels: Record<MoodType, string> = {
        joy: "loving this",
        love: "heart eyes",
        sadness: "crying rn",
        tension: "on edge",
        cringe: "oh no...",
        neutral: "taking it in",
      }

      internalState.activeMood = mood
      internalState.emotionLabel = labels[mood]
      card.update({
        activeMood: mood,
        emotionLabel: labels[mood],
      })
    },

    onSizeChange(size: CardSize): void {
      currentSize = size
      persistCurrentMeta(size)
    },

    onDragEnd(x: number, y: number): void {
      persistCurrentMeta(currentSize, x, y)
    },
  }

  const card = new DramaCard(container, internalState, events)

  if (meta) {
    if (meta.x >= 0 && meta.y >= 0) card.setPosition(meta.x, meta.y)
    if (meta.size) card.setSize(meta.size, false)
  }

  let rafId: number | null = null

  const tick = (): void => {
    const v = findVideo()
    if (!v) return

    const freshCtx = detectDramaContext()
    const epP = v.duration > 0 ? v.currentTime / v.duration : 0
    const oP = calculateOverallProgress(freshCtx, epP)

    const likelihood = likelihoodHeuristic(oP, internalState.rating)

    const updates: Partial<CardState> = {
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
    }

    Object.assign(internalState, updates)
    card.update(updates)
  }

  const startRaf = (): void => {
    if (rafId !== null) return

    const loop = (): void => {
      tick()
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
  }

  const stopRaf = (): void => {
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

  video.addEventListener("play", () => card.update({ isPlaying: true }))

  video.addEventListener("pause", () => card.update({ isPlaying: false }))

  log.info("Running.")
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init()
  })
} else {
  void init()
}

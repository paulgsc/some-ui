import type { ScrapedMeta } from "@drama/types"

/**
 * Injected script executed within the active video window context.
 * Performs DOM evaluation across nested targets to extract structural metadata frames.
 */
export function scrapeActiveTabMedia(): ScrapedMeta {
  const videoElements = Array.from(document.querySelectorAll("video"))
  const scoreTargets = videoElements.map((video) => {
    const rect = video.getBoundingClientRect()
    const area = rect.width * rect.height

    let score = area
    if (video.currentTime > 0 && !video.paused && !video.ended) {
      score *= 3.0 // Heavily prioritize actively playing media
    }
    if (rect.width === 0 || rect.height === 0) {
      score = 0 // Discard completely hidden elements
    }
    return { video, score }
  })

  // Select the highest-scoring media target
  const primaryTarget = scoreTargets.sort((a, b) => b.score - a.score)[0]?.video

  // Generic heuristic extraction strategies
  const docTitle = document.title || ""
  const cleanedTitle = docTitle.replace(/[►▶]/g, "").trim()

  // Parsing algorithms for structural metadata
  const epRegex = /(?:ep|episode|화|회|第)\s*(\d+)/i
  const epMatch = cleanedTitle.match(epRegex)
  const derivedEpisode = epMatch ? `Ep ${epMatch[1]}` : ""

  const networkSelector = () => {
    const host = window.location.hostname.toLowerCase()
    if (host.includes("netflix")) return "Netflix"
    if (host.includes("viki")) return "Rakuten Viki"
    if (host.includes("youtube")) return "YouTube"
    if (host.includes("crunchyroll")) return "Crunchyroll"
    return host.split(".").slice(-2, -1)[0]?.toUpperCase() || "Web"
  }

  const formatTimestamp = (secs: number): string => {
    if (isNaN(secs) || secs <= 0) return "00:00"
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    const pad = (num: number) => String(num).padStart(2, "0")
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  }

  const findPoster = (): string | null => {
    if (primaryTarget?.poster) return primaryTarget.poster
    const ogImg = document
      .querySelector("meta[property='og:image']")
      ?.getAttribute("content")
    if (ogImg) return ogImg
    const twitterImg = document
      .querySelector("meta[name='twitter:image']")
      ?.getAttribute("content")
    if (twitterImg) return twitterImg
    return null
  }

  return {
    title: cleanedTitle,
    episode: derivedEpisode,
    network: networkSelector(),
    url: window.location.href,
    posterUrl: findPoster(),
    timestamp: primaryTarget
      ? formatTimestamp(primaryTarget.currentTime)
      : "00:00",
    progress:
      primaryTarget && primaryTarget.duration
        ? primaryTarget.currentTime / primaryTarget.duration
        : 0,
    isPlaying: primaryTarget
      ? !primaryTarget.paused && !primaryTarget.ended
      : false,
    videoCount: videoElements.length,
  }
}

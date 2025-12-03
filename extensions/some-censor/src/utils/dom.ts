import type { VideoMetadata } from "@censor/types"

export const VIDEO_SELECTORS = [
  "ytd-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-panel-video-renderer",
]

export const VIDEO_SELECTOR_STRING = VIDEO_SELECTORS.join(", ")

export function getAllVideoElements(): Array<Element> {
  const elements = Array.from(document.querySelectorAll(VIDEO_SELECTOR_STRING))
  console.log(`[DOM] Found ${elements.length} video elements`)
  return elements
}

export function isVideoElement(element: Element): boolean {
  return VIDEO_SELECTORS.some((selector) => element.matches(selector))
}

export function extractVideoId(element: Element): string | null {
  try {
    // 1) Fast path: data-video-id attribute
    const dataId = element.getAttribute("data-video-id")
    if (dataId) {
      console.log("[DOM] extractVideoId: found data-video-id =", dataId)
      return dataId
    }

    // 2) Search anchors in priority order
    const selectors = [
      "a#video-title",
      "a#thumbnail",
      "a.yt-simple-endpoint",
      'a[href*="/watch"]', // Catches your logged example
      'a[href*="/shorts/"]',
      "a", // Final fallback: check all anchors
    ]

    for (const sel of selectors) {
      const candidates = Array.from(
        element.querySelectorAll<HTMLAnchorElement>(sel)
      )
      for (const a of candidates) {
        const href = a.href || a.getAttribute("href")
        if (!href) continue

        // Match /watch?v=VIDEOID
        const watchMatch = href.match(/[?&]v=([^&/#]+)/)
        if (watchMatch) {
          console.log(`[DOM] extractVideoId: found ${watchMatch[1]} via ${sel}`)
          return watchMatch[1]
        }

        // Match /shorts/VIDEOID
        const shortsMatch = href.match(/\/shorts\/([^/?#&]+)/)
        if (shortsMatch) {
          console.log(
            `[DOM] extractVideoId: found ${shortsMatch[1]} via /shorts`
          )
          return shortsMatch[1]
        }

        // Match /watch/VIDEOID (rare alternative format)
        const pathMatch = href.match(/\/watch\/([^/?#&]+)/)
        if (pathMatch) {
          console.log(
            `[DOM] extractVideoId: found ${pathMatch[1]} via /watch path`
          )
          return pathMatch[1]
        }
      }
    }
  } catch (err) {
    console.warn("[DOM] extractVideoId error:", err, element)
  }

  console.warn("[DOM] extractVideoId: NO video id found for element:", element)
  return null
}

export function extractChannelId(element: Element): string | null {
  try {
    // Search all anchors for channel links
    const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>("a"))
    for (const a of anchors) {
      const href = a.href || a.getAttribute("href")
      if (!href) continue

      // /channel/UC...
      const channelMatch = href.match(/\/channel\/([^/?#&]+)/)
      if (channelMatch) {
        console.log(`[DOM] extractChannelId: found ${channelMatch[1]}`)
        return channelMatch[1]
      }

      // /@handle
      const handleMatch = href.match(/\/@([^/?#&]+)/)
      if (handleMatch) {
        console.log(`[DOM] extractChannelId: found @${handleMatch[1]}`)
        return `@${handleMatch[1]}`
      }

      // /c/name or /user/name -> normalize to @name
      const cMatch = href.match(/\/c\/([^/?#&]+)/)
      if (cMatch) {
        console.log(`[DOM] extractChannelId: found /c/ -> @${cMatch[1]}`)
        return `@${cMatch[1]}`
      }
      const userMatch = href.match(/\/user\/([^/?#&]+)/)
      if (userMatch) {
        console.log(`[DOM] extractChannelId: found /user/ -> @${userMatch[1]}`)
        return `@${userMatch[1]}`
      }
    }

    // Fallback: channel name text
    const channelNameNode = element.querySelector(
      "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
    )
    if (channelNameNode?.textContent) {
      const name = channelNameNode.textContent.trim()
      if (name) {
        console.log(`[DOM] extractChannelId: fallback to display name: ${name}`)
        return name
      }
    }
  } catch (err) {
    console.warn("[DOM] extractChannelId error:", err, element)
  }

  console.warn(
    "[DOM] extractChannelId: NO channel id found for element:",
    element
  )
  return null
}

export function extractMetadata(element: Element): VideoMetadata | null {
  try {
    const channelName =
      element
        .querySelector(
          "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
        )
        ?.textContent?.trim() || "Unknown Channel"

    const duration =
      element
        .querySelector("span.ytd-thumbnail-overlay-time-status-renderer")
        ?.textContent?.trim() || ""

    const uploadDate =
      element
        .querySelector("#metadata-line span:nth-child(2)")
        ?.textContent?.trim() || ""

    return { channelName, duration, uploadDate }
  } catch {
    return null
  }
}

export function extractTitle(element: Element): string | null {
  // Try multiple selectors in order of specificity
  const selectors = [
    "#video-title", // Standard video renderer
    "a#video-title", // Sometimes wrapped in anchor
    "#video-title-link", // Alternative ID
    "yt-formatted-string#video-title", // With element type
    "h3 a", // Generic heading link
    "[aria-label*='title']", // Accessibility label
  ]

  for (const selector of selectors) {
    const titleEl = element.querySelector(selector)
    if (titleEl) {
      const title = titleEl.textContent?.trim()
      if (title) {
        console.log(`[DOM] extractTitle: found "${title}" via ${selector}`)
        return title
      }

      // Also check aria-label attribute
      const ariaLabel = titleEl.getAttribute("aria-label")
      if (ariaLabel) {
        console.log(
          `[DOM] extractTitle: found "${ariaLabel}" via aria-label on ${selector}`
        )
        return ariaLabel
      }
    }
  }

  console.warn("[DOM] extractTitle: NO title found for element:", element)
  console.warn(
    "[DOM] extractTitle: Element HTML:",
    element.innerHTML.substring(0, 200)
  )
  return null
}

export function obfuscateTitle(title: string): string {
  return title
    .split(" ")
    .map((word) => (word.length <= 3 ? word : "*".repeat(word.length)))
    .join(" ")
}

export function createMetadataDisplay(metadata: {
  channelName: string
  views?: string
  uploadDate?: string
  duration?: string
}): HTMLElement {
  const container = document.createElement("div")
  container.className = "boyo-metadata"

  const items = [
    { label: "Channel", value: metadata.channelName },
    metadata.views && { label: "Views", value: metadata.views },
    metadata.uploadDate && { label: "Uploaded", value: metadata.uploadDate },
    metadata.duration && { label: "Duration", value: metadata.duration },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  items.forEach((item) => {
    const itemEl = document.createElement("div")
    itemEl.className = "boyo-metadata-item"
    itemEl.innerHTML = `<strong>${item.label}:</strong> ${item.value}`
    container.appendChild(itemEl)
  })

  return container
}

export function createTitleDisplay(
  title: string,
  _fade?: boolean
): HTMLElement {
  const titleEl = document.createElement("div")
  titleEl.className = "boyo-title" // CRITICAL: CSS expects this class
  titleEl.textContent = title
  return titleEl
}

export function createOverlay(videoId: string): HTMLElement {
  const overlay = document.createElement("div")
  overlay.className = "boyo-overlay"
  overlay.dataset.videoId = videoId
  overlay.dataset.level = "0" // Start at MASKED level
  return overlay
}

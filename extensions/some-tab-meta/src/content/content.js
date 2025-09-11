// YouTube Now Playing Content Script
let lastVideoId = null
let isTracking = false

// Function to extract video ID from URL
function getVideoId() {
  const url = new URL(window.location.href)
  return url.searchParams.get("v")
}

// Function to get video metadata
function getVideoMetadata() {
  const video = document.querySelector("video")
  if (!video) return null

  const videoId = getVideoId()
  if (!videoId) return null

  // Get title
  const titleElement =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("h1.title") ||
    document.querySelector(".watch-title")
  const title =
    titleElement?.textContent?.trim() ||
    document.title.replace(" - YouTube", "")

  // Get channel name
  const channelElement =
    document.querySelector("#channel-name a") ||
    document.querySelector(".ytd-channel-name a") ||
    document.querySelector("#owner-text a")
  const channel = channelElement?.textContent?.trim() || "Unknown Channel"

  // Get current time and duration
  const currentTime = Math.floor(video.currentTime)
  const duration = Math.floor(video.duration) || 0

  // Generate thumbnail URL using video ID
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`

  return {
    title,
    channel,
    video_id: videoId,
    current_time: currentTime,
    duration,
    thumbnail,
  }
}

// Function to send data to server via background script
function sendToServer(metadata) {
  // Send to background script instead of direct fetch
  chrome.runtime.sendMessage(
    {
      type: "now-playing",
      payload: metadata,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.log(
          "Failed to send to background:",
          chrome.runtime.lastError.message
        )
      }
    }
  )
}

// Function to check if video is playing
function isVideoPlaying() {
  const video = document.querySelector("video")
  return video && !video.paused && !video.ended && video.readyState > 2
}

// Main tracking function
function trackVideo() {
  if (!isVideoPlaying()) {
    if (isTracking) {
      isTracking = false
      lastVideoId = null
    }
    return
  }

  const metadata = getVideoMetadata()
  if (!metadata) return

  // Only send if this is a new video or we just started tracking
  if (metadata.video_id !== lastVideoId || !isTracking) {
    sendToServer(metadata)
    lastVideoId = metadata.video_id
    isTracking = true
  }
}

// Initialize tracking
function init() {
  // Check immediately
  setTimeout(trackVideo, 1000)

  // Then check every 5 seconds
  setInterval(trackVideo, 5000)

  // Also listen for video events for more responsive tracking
  document.addEventListener("play", trackVideo, true)
  document.addEventListener(
    "pause",
    () => {
      if (isTracking) {
        isTracking = false
        lastVideoId = null
      }
    },
    true
  )
}

// Handle navigation changes (YouTube is a SPA)
let currentUrl = location.href
const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href
    lastVideoId = null
    isTracking = false
    // Re-initialize after URL change
    setTimeout(init, 1000)
  }
})

observer.observe(document, { childList: true, subtree: true })

// Initial setup
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}

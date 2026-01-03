let isTracking = false
let videoElement: HTMLVideoElement | null = null
let lastTime = 0
let progressInterval: number | null = null

// Listen for tracking commands from background
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "START_TRACKING") {
    startTracking()
  }
})

function startTracking() {
  if (isTracking) return

  isTracking = true
  console.log("C-Drama tracking started")

  // Find YouTube video element
  findAndTrackVideo()

  // Watch for video element changes (YouTube is SPA)
  const observer = new MutationObserver(() => {
    if (!videoElement || !document.contains(videoElement)) {
      findAndTrackVideo()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

function findAndTrackVideo() {
  videoElement = document.querySelector("video.html5-main-video")

  if (!videoElement) {
    // Retry after a short delay
    setTimeout(findAndTrackVideo, 1000)
    return
  }

  console.log("Video element found")

  // Send initial metadata
  sendVideoMetadata()

  // Set up event listeners
  setupVideoListeners()

  // Start progress tracking
  startProgressTracking()
}

function sendVideoMetadata() {
  if (!videoElement) return

  const title =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
      ?.textContent || "Unknown Title"
  const channelName =
    document.querySelector("ytd-channel-name a")?.textContent ||
    "Unknown Channel"
  const thumbnailUrl =
    document.querySelector('link[rel="image_src"]')?.getAttribute("href") || ""

  browser.runtime.sendMessage({
    type: "VIDEO_METADATA",
    data: {
      url: window.location.href,
      title,
      channelName,
      thumbnailUrl,
      currentTime: videoElement.currentTime,
      duration: videoElement.duration,
    },
  })
}

function setupVideoListeners() {
  if (!videoElement) return

  videoElement.addEventListener("pause", () => {
    browser.runtime.sendMessage({
      type: "VIDEO_INTERACTION",
      data: {
        action: "pause",
        timestamp: videoElement?.currentTime || 0,
      },
    })
  })

  videoElement.addEventListener("play", () => {
    browser.runtime.sendMessage({
      type: "VIDEO_INTERACTION",
      data: {
        action: "play",
        timestamp: videoElement?.currentTime || 0,
      },
    })
  })

  videoElement.addEventListener("seeked", () => {
    browser.runtime.sendMessage({
      type: "VIDEO_INTERACTION",
      data: {
        action: "seek",
        timestamp: videoElement?.currentTime || 0,
      },
    })
  })
}

function startProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval)
  }

  progressInterval = window.setInterval(() => {
    if (!videoElement || !isTracking) return

    browser.runtime.sendMessage({
      type: "VIDEO_PROGRESS",
      data: {
        currentTime: videoElement.currentTime,
        duration: videoElement.duration,
        paused: videoElement.paused,
      },
    })
  }, 2000) // Send update every 2 seconds
}

// Keyboard shortcuts for emotional reactions
document.addEventListener("keydown", (e) => {
  if (!isTracking) return

  // Only trigger if not typing in an input
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return
  }

  let emotion: string | null = null
  let emoji: string | null = null

  // Use number keys for quick reactions
  switch (e.key) {
    case "1":
      emotion = "joy"
      emoji = "😊"
      break
    case "2":
      emotion = "sadness"
      emoji = "😢"
      break
    case "3":
      emotion = "surprise"
      emoji = "😲"
      break
    case "4":
      emotion = "fear"
      emoji = "😱"
      break
    case "5":
      emotion = "anger"
      emoji = "😠"
      break
  }

  if (emotion && videoElement) {
    e.preventDefault()

    browser.runtime.sendMessage({
      type: "EMOTIONAL_REACTION",
      data: {
        emotion,
        emoji,
        intensity: 0.7,
        notes: "",
      },
    })

    // Show brief feedback
    showReactionFeedback(emoji!)
  }
})

function showReactionFeedback(emoji: string) {
  const feedback = document.createElement("div")
  feedback.textContent = emoji
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 72px;
    z-index: 99999;
    pointer-events: none;
    animation: fadeOut 1s ease-out forwards;
  `

  const style = document.createElement("style")
  style.textContent = `
    @keyframes fadeOut {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }
  `

  document.head.appendChild(style)
  document.body.appendChild(feedback)

  setTimeout(() => {
    feedback.remove()
    style.remove()
  }, 1000)
}

console.log("C-Drama content script loaded")

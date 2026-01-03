type DramaSession = {
  dramaId: string
  episodeNumber: number
  videoUrl: string
  videoTitle: string
  channelName: string
  thumbnailUrl: string
  startTime: number
  lastUpdateTime: number
  watchDuration: number // in seconds
  currentTimestamp: number // current video position in seconds
  totalDuration: number // total video length
  emotionalReactions: Array<EmotionalReaction>
  pauseCount: number
  rewindCount: number
  forwardCount: number
}

type EmotionalReaction = {
  timestamp: number // video timestamp in seconds
  realTime: number // actual time of reaction
  emotion: "joy" | "sadness" | "surprise" | "fear" | "anger" | "neutral"
  intensity: number // 0-1
  emoji?: string
  notes?: string
}

type TrackedTab = {
  tabId: number
  dramaId: string
  episodeNumber: number
  startTime: number
}

// Store active drama sessions
const activeSessions = new Map<number, DramaSession>()
const trackedTabs = new Map<number, TrackedTab>()

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab?.id) return

  const tabId = sender.tab.id

  switch (message.type) {
    case "VIDEO_METADATA":
      handleVideoMetadata(tabId, message.data)
      break

    case "VIDEO_PROGRESS":
      handleVideoProgress(tabId, message.data)
      break

    case "VIDEO_INTERACTION":
      handleVideoInteraction(tabId, message.data)
      break

    case "EMOTIONAL_REACTION":
      handleEmotionalReaction(tabId, message.data)
      break
  }
})

// Listen for tab marking from popup
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.type === "MARK_AS_CDRAMA") {
    const { tabId, dramaId, episodeNumber } = message.data
    trackedTabs.set(tabId, {
      tabId,
      dramaId,
      episodeNumber,
      startTime: Date.now(),
    })

    // Send message to content script to start tracking
    browser.tabs.sendMessage(tabId, { type: "START_TRACKING" })

    return Promise.resolve({ success: true })
  }

  if (message.type === "UNMARK_CDRAMA") {
    const { tabId } = message.data
    endSession(tabId)
    return Promise.resolve({ success: true })
  }

  if (message.type === "GET_TRACKED_TABS") {
    return Promise.resolve({
      tabs: Array.from(trackedTabs.values()),
    })
  }
})

function handleVideoMetadata(tabId: number, data: any) {
  const tracked = trackedTabs.get(tabId)
  if (!tracked) return

  const session: DramaSession = {
    dramaId: tracked.dramaId,
    episodeNumber: tracked.episodeNumber,
    videoUrl: data.url,
    videoTitle: data.title,
    channelName: data.channelName,
    thumbnailUrl: data.thumbnailUrl,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    watchDuration: 0,
    currentTimestamp: data.currentTime || 0,
    totalDuration: data.duration || 0,
    emotionalReactions: [],
    pauseCount: 0,
    rewindCount: 0,
    forwardCount: 0,
  }

  activeSessions.set(tabId, session)
  sendToBackend(session, "session_start")
}

function handleVideoProgress(tabId: number, data: any) {
  const session = activeSessions.get(tabId)
  if (!session) return

  const now = Date.now()
  const timeDiff = (now - session.lastUpdateTime) / 1000

  // Only count as watch time if reasonable (not paused for too long)
  if (timeDiff < 5) {
    session.watchDuration += timeDiff
  }

  // Detect rewind/forward
  const timestampDiff = data.currentTime - session.currentTimestamp
  if (Math.abs(timestampDiff) > 5) {
    if (timestampDiff < 0) {
      session.rewindCount++
    } else if (timestampDiff > 10) {
      session.forwardCount++
    }
  }

  session.currentTimestamp = data.currentTime
  session.lastUpdateTime = now

  activeSessions.set(tabId, session)

  // Send update every 30 seconds
  if (session.watchDuration % 30 < timeDiff) {
    sendToBackend(session, "progress_update")
  }
}

function handleVideoInteraction(tabId: number, data: any) {
  const session = activeSessions.get(tabId)
  if (!session) return

  if (data.action === "pause") {
    session.pauseCount++
  }

  activeSessions.set(tabId, session)
}

function handleEmotionalReaction(tabId: number, data: any) {
  const session = activeSessions.get(tabId)
  if (!session) return

  const reaction: EmotionalReaction = {
    timestamp: session.currentTimestamp,
    realTime: Date.now(),
    emotion: data.emotion,
    intensity: data.intensity || 0.5,
    emoji: data.emoji,
    notes: data.notes,
  }

  session.emotionalReactions.push(reaction)
  activeSessions.set(tabId, session)

  sendToBackend({ ...session, latestReaction: reaction }, "emotional_reaction")
}

function endSession(tabId: number) {
  const session = activeSessions.get(tabId)
  if (session) {
    sendToBackend(session, "session_end")
    activeSessions.delete(tabId)
  }
  trackedTabs.delete(tabId)
}

async function sendToBackend(data: any, eventType: string) {
  const payload = {
    eventType,
    timestamp: Date.now(),
    data,
  }

  try {
    await fetch("https://api.example.com/cdrama-tracking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    console.log("Data sent to backend:", eventType)
  } catch (error) {
    console.error("Failed to send data to backend:", error)
    // Could implement retry logic or local storage backup here
  }
}

// Clean up when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  endSession(tabId)
})

// Periodic sync every 60 seconds for active sessions
setInterval(() => {
  activeSessions.forEach((session, _tabId) => {
    sendToBackend(session, "periodic_sync")
  })
}, 60000)

console.log("C-Drama Tracker background script loaded")

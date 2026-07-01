import type {
  BadgeStatus,
  ExtensionState,
  Message,
  VideoMetadata,
} from "./types"

const initialState: ExtensionState = {
  isEnabled: true,
  lastStatus: "idle",
}

const BADGES = {
  enabled: { text: "", color: "#4CAF50" },
  disabled: { text: "OFF", color: "#757575" },
  success: { text: "✓", color: "#4CAF50" },
  error: { text: "!", color: "#F44336" },
} as const

let state: ExtensionState = { ...initialState }

//
// State management
//
async function loadState(): Promise<void> {
  const saved = await chrome.storage.local.get(["extensionState"])
  if (saved.extensionState) {
    state = { ...state, ...saved.extensionState }
  }
}

async function saveState(): Promise<void> {
  await chrome.storage.local.set({ extensionState: state })
}

//
// Badge handling
//
function updateBadge(badge: BadgeStatus): void {
  chrome.action.setBadgeText({ text: badge.text })
  chrome.action.setBadgeBackgroundColor({ color: badge.color })
}

//
// Server communication
//
async function sendToServer(metadata: VideoMetadata): Promise<void> {
  try {
    const response = await fetch("http://nixos.local:3000/now-playing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`)
    }

    state = {
      ...state,
      lastStatus: "success",
      lastSong: metadata.title,
      lastError: undefined,
    }

    updateBadge(BADGES.success)
    setTimeout(() => updateBadge(BADGES.enabled), 2000)
  } catch (error) {
    state = {
      ...state,
      lastStatus: "error",
      lastError: error instanceof Error ? error.message : "Unknown error",
    }

    updateBadge(BADGES.error)
    // eslint-disable-next-line no-console
    console.error("Background fetch error:", error)
  }

  await saveState()
}

//
// Message handling
//
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): Promise<void> {
  switch (message.type) {
    case "now-playing":
      if (state.isEnabled && message.payload) {
        await sendToServer(message.payload)
      }
      break

    case "toggle-tracking":
      state = { ...state, isEnabled: !state.isEnabled }
      await saveState()
      updateBadge(state.isEnabled ? BADGES.enabled : BADGES.disabled)
      break

    case "get-status":
      sendResponse(state)
      break
  }
}

//
// Bootstrap
//
async function init(): Promise<void> {
  chrome.runtime.onInstalled.addListener(() => {
    updateBadge(BADGES.enabled)
  })

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    void handleMessage(msg, sender, sendResponse)
    return true // keep channel open for async
  })

  await loadState()
}

init()

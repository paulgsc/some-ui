type BackgroundMessage = {
  type: "POST_UTTERANCE" | "GET_SETTINGS" | "UPDATE_SETTINGS"
  payload?: any
}

type BackgroundResponse = {
  success: boolean
  data?: any
  error?: string
}
type ExtensionSettings = {
  enabled: boolean
  maxUtteranceLength: number
  minUtteranceLength: number
  serverUrl: string
  postThrottleMs: number
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  maxUtteranceLength: 200,
  minUtteranceLength: 3,
  serverUrl: "http://nixos.local:3000/utter",
  postThrottleMs: 500,
}

export class StorageService {
  static async getSettings(): Promise<ExtensionSettings> {
    try {
      const result = await chrome.storage.sync.get("settings")
      return { ...DEFAULT_SETTINGS, ...result.settings }
    } catch (error) {
      console.warn("Failed to load settings, using defaults:", error)
      return DEFAULT_SETTINGS
    }
  }

  static async updateSettings(
    settings: Partial<ExtensionSettings>
  ): Promise<void> {
    try {
      const currentSettings = await this.getSettings()
      const newSettings = { ...currentSettings, ...settings }
      await chrome.storage.sync.set({ settings: newSettings })
    } catch (error) {
      console.error("Failed to save settings:", error)
      throw error
    }
  }

  static async resetSettings(): Promise<void> {
    try {
      await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    } catch (error) {
      console.error("Failed to reset settings:", error)
      throw error
    }
  }

  static onSettingsChanged(
    callback: (settings: ExtensionSettings) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.settings) {
        callback(changes.settings.newValue)
      }
    })
  }
}
// Background script to handle POST requests and settings management
chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    sender,
    sendResponse: (response: BackgroundResponse) => void
  ) => {
    handleMessage(message, sender, sendResponse)
    return true // Keep the message channel open for async response
  }
)

async function handleMessage(
  message: BackgroundMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    switch (message.type) {
      case "POST_UTTERANCE":
        await handlePostUtterance(message.payload, sendResponse)
        break

      case "GET_SETTINGS":
        await handleGetSettings(sendResponse)
        break

      case "UPDATE_SETTINGS":
        await handleUpdateSettings(message.payload, sendResponse)
        break

      default:
        sendResponse({
          success: false,
          error: `Unknown message type: ${message.type}`,
        })
    }
  } catch (error) {
    console.error("Error handling message:", error)
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

async function handlePostUtterance(
  payload: any,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    const settings = await StorageService.getSettings()

    const response = await fetch(settings.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      console.log("Text posted successfully:", payload)
      sendResponse({
        success: true,
        data: { status: response.status },
      })
    } else {
      console.warn("Failed to post text:", response.status, response.statusText)
      sendResponse({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      })
    }
  } catch (error) {
    console.warn("Error posting text:", error)
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    })
  }
}

async function handleGetSettings(
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    const settings = await StorageService.getSettings()
    sendResponse({
      success: true,
      data: settings,
    })
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get settings",
    })
  }
}

async function handleUpdateSettings(
  payload: any,
  sendResponse: (response: BackgroundResponse) => void
): Promise<void> {
  try {
    await StorageService.updateSettings(payload)
    const newSettings = await StorageService.getSettings()
    sendResponse({
      success: true,
      data: newSettings,
    })
  } catch (error) {
    sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update settings",
    })
  }
}

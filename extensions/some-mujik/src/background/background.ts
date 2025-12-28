type SessionMetadata = {
  videoId: string
  title: string
  channel: string
  duration: string
  timestamp: number
  url: string
  action: string
}

class BackgroundService {
  private readonly BACKEND_ENDPOINT =
    "https://your-api-endpoint.com/api/session-metadata"

  constructor() {
    this.setupMessageListener()
    this.initializeExtension()
  }

  private async initializeExtension(): Promise<void> {
    // Set default enabled state if not set
    const result = await chrome.storage.local.get(["extensionEnabled"])
    if (result.extensionEnabled === undefined) {
      await chrome.storage.local.set({ extensionEnabled: true })
    }
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
          console.error("Background script error:", error)
          sendResponse({ error: error.message })
        })
      return true // Keep message channel open for async response
    })
  }

  private async handleMessage(
    message: any,
    _sender: chrome.runtime.MessageSender
  ): Promise<any> {
    switch (message.type) {
      case "SEND_SESSION_METADATA":
        return this.sendSessionMetadata(message.data)

      case "GET_EXTENSION_STATE":
        return this.getExtensionState()

      case "TOGGLE_EXTENSION":
        return this.toggleExtension(message.enabled)

      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  }

  private async sendSessionMetadata(
    metadata: SessionMetadata
  ): Promise<{ success: boolean }> {
    try {
      // Check if extension is enabled
      const { extensionEnabled } = await chrome.storage.local.get([
        "extensionEnabled",
      ])
      if (!extensionEnabled) {
        console.log("Extension disabled, skipping metadata send")
        return { success: false }
      }

      console.log("Sending session metadata:", metadata)

      const response = await fetch(this.BACKEND_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer YOUR_API_KEY", // Replace with actual auth
        },
        body: JSON.stringify(metadata),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Session metadata sent successfully:", result)

      return { success: true }
    } catch (error) {
      console.error("Failed to send session metadata:", error)
      return { success: false }
    }
  }

  private async getExtensionState(): Promise<{ enabled: boolean }> {
    const { extensionEnabled } = await chrome.storage.local.get([
      "extensionEnabled",
    ])
    return { enabled: extensionEnabled ?? true }
  }

  private async toggleExtension(
    enabled: boolean
  ): Promise<{ enabled: boolean }> {
    await chrome.storage.local.set({ extensionEnabled: enabled })

    // Notify all YouTube tabs about the state change
    const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })

    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "EXTENSION_STATE_CHANGED",
            enabled,
          })
        } catch (error) {
          // Tab might not have content script loaded, ignore
        }
      }
    }

    return { enabled }
  }
}

// Initialize the background service
new BackgroundService()

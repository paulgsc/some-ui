import type { Message } from "@censor/types"
import { storage } from "@censor/utils/storage"

class BackgroundController {
  constructor() {
    this.initialize()
  }

  private initialize(): void {
    console.log("[BOYO Background] Initializing")

    // Initialize storage
    storage.initialize()

    // Listen for messages from content script and popup
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this))

    // Clear session state on browser startup
    this.clearSessionOnStartup()
  }

  private async handleMessage(
    message: Message,
    _sender: browser.runtime.MessageSender
  ): Promise<any> {
    console.log("[BOYO Background] Received message:", message.type)

    switch (message.type) {
      case "ADD_TO_WHITELIST":
        await storage.addToWhitelist(message.payload)
        return { success: true }

      case "REMOVE_FROM_WHITELIST":
        await storage.removeFromWhitelist(message.payload)
        return { success: true }

      case "GET_WHITELIST":
        const whitelist = await storage.getWhitelist()
        return { whitelist }

      case "CLEAR_SESSION":
        await storage.clearSession()
        // Notify all tabs to refresh
        this.notifyAllTabs("SESSION_CLEARED")
        return { success: true }

      case "UPDATE_SETTINGS":
        await storage.updateSettings(message.payload)
        return { success: true }

      default:
        console.warn("[BOYO Background] Unknown message type:", message.type)
        return { error: "Unknown message type" }
    }
  }

  private async notifyAllTabs(messageType: string): Promise<void> {
    const tabs = await browser.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await browser.tabs.sendMessage(tab.id, { type: messageType })
        } catch (e) {
          // Tab might not have content script
        }
      }
    }
  }

  private async clearSessionOnStartup(): Promise<void> {
    await storage.clearSession()
    console.log("[BOYO Background] Session state cleared on startup")
  }
}

// Initialize background controller
new BackgroundController()

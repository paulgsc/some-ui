import type { WhitelistEntry } from "@censor/types"
import { storage } from "@censor/utils/storage"

class PopupController {
  private whitelistEl: HTMLElement
  private whitelistCountEl: HTMLElement
  private sessionCountEl: HTMLElement

  constructor() {
    this.whitelistEl = document.getElementById("whitelist")!
    this.whitelistCountEl = document.getElementById("whitelistCount")!
    this.sessionCountEl = document.getElementById("sessionCount")!

    this.initialize()
  }

  private async initialize(): Promise<void> {
    await storage.initialize()

    // Load and display whitelist
    await this.loadWhitelist()

    // Load stats
    await this.loadStats()

    // Set up event listeners
    this.setupEventListeners()
  }

  private async loadWhitelist(): Promise<void> {
    const whitelist = await storage.getWhitelist()

    if (whitelist.length === 0) {
      this.whitelistEl.innerHTML =
        '<div class="whitelist-empty">No channels whitelisted yet</div>'
      return
    }

    this.whitelistEl.innerHTML = whitelist
      .map((entry) => this.renderWhitelistItem(entry))
      .join("")

    // Add remove button listeners
    this.whitelistEl.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const channelId = (e.target as HTMLElement).dataset.channelId
        if (channelId) {
          await this.removeFromWhitelist(channelId)
        }
      })
    })
  }

  private renderWhitelistItem(entry: WhitelistEntry): string {
    const date = new Date(entry.addedAt).toLocaleDateString()
    return `
      <div class="whitelist-item">
        <div class="channel-info">
          <div class="channel-name">${this.escapeHtml(entry.channelName)}</div>
          <div class="channel-date">Added ${date}</div>
        </div>
        <button class="remove-btn" data-channel-id="${entry.channelId}">Remove</button>
      </div>
    `
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  private async removeFromWhitelist(channelId: string): Promise<void> {
    await browser.runtime.sendMessage({
      type: "REMOVE_FROM_WHITELIST",
      payload: channelId,
    })

    // Reload whitelist
    await this.loadWhitelist()
    await this.loadStats()
  }

  private async loadStats(): Promise<void> {
    const whitelist = await storage.getWhitelist()
    const sessionState = await storage.getSessionState()

    this.whitelistCountEl.textContent = whitelist.length.toString()
    this.sessionCountEl.textContent =
      Object.keys(sessionState).length.toString()
  }

  private setupEventListeners(): void {
    document
      .getElementById("clearSession")
      ?.addEventListener("click", async () => {
        await browser.runtime.sendMessage({ type: "CLEAR_SESSION" })
        await this.loadStats()

        // Reload active tab
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        if (tabs[0]?.id) {
          browser.tabs.reload(tabs[0].id)
        }
      })

    document.getElementById("reload")?.addEventListener("click", async () => {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (tabs[0]?.id) {
        browser.tabs.reload(tabs[0].id)
      }
      window.close()
    })
  }
}

// Initialize popup
new PopupController()

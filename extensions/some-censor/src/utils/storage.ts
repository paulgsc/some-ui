import type { StorageData, VideoState, WhitelistEntry } from "@censor/types"

const DEFAULT_STORAGE: StorageData = {
  whitelist: [],
  sessionState: {},
  settings: {
    enableWhitelist: true,
    blurIntensity: 20,
  },
}

export class StorageManager {
  private cache: StorageData | null = null

  async initialize(): Promise<void> {
    const data = await browser.storage.local.get(null)
    this.cache = { ...DEFAULT_STORAGE, ...data } as StorageData
  }

  async getWhitelist(): Promise<Array<WhitelistEntry>> {
    if (!this.cache) await this.initialize()
    return this.cache!.whitelist || []
  }

  async addToWhitelist(entry: WhitelistEntry): Promise<void> {
    if (!this.cache) await this.initialize()

    // Check if already exists
    const exists = this.cache!.whitelist.some(
      (e) => e.channelId === entry.channelId
    )

    if (!exists) {
      this.cache!.whitelist.push(entry)
      await browser.storage.local.set({ whitelist: this.cache!.whitelist })
    }
  }

  async removeFromWhitelist(channelId: string): Promise<void> {
    if (!this.cache) await this.initialize()

    this.cache!.whitelist = this.cache!.whitelist.filter(
      (e) => e.channelId !== channelId
    )
    await browser.storage.local.set({ whitelist: this.cache!.whitelist })
  }

  async isWhitelisted(channelId: string): Promise<boolean> {
    const whitelist = await this.getWhitelist()
    return whitelist.some((e) => e.channelId === channelId)
  }

  async getSessionState(): Promise<Record<string, VideoState>> {
    if (!this.cache) await this.initialize()
    return this.cache!.sessionState || {}
  }

  async updateVideoState(videoId: string, state: VideoState): Promise<void> {
    if (!this.cache) await this.initialize()

    this.cache!.sessionState[videoId] = state
    // Session state is memory-only, no persistence needed
  }

  async clearSession(): Promise<void> {
    if (!this.cache) await this.initialize()

    this.cache!.sessionState = {}
  }

  async getSettings() {
    if (!this.cache) await this.initialize()
    return this.cache!.settings
  }

  async updateSettings(
    settings: Partial<StorageData["settings"]>
  ): Promise<void> {
    if (!this.cache) await this.initialize()

    this.cache!.settings = { ...this.cache!.settings, ...settings }
    await browser.storage.local.set({ settings: this.cache!.settings })
  }
}

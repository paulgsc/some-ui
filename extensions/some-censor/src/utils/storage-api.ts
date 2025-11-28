import type { VideoState, WhitelistEntry } from "@censor/types"

/**
 * Content script API - communicates with background script for storage operations
 */
export const storageAPI = {
  async initialize(): Promise<void> {
    // No-op for content scripts - background handles initialization
  },

  async getWhitelist(): Promise<Array<WhitelistEntry>> {
    const response = await browser.runtime.sendMessage({
      type: "GET_WHITELIST",
    })
    return response.whitelist
  },

  async addToWhitelist(entry: WhitelistEntry): Promise<void> {
    await browser.runtime.sendMessage({
      type: "ADD_TO_WHITELIST",
      payload: entry,
    })
  },

  async removeFromWhitelist(channelId: string): Promise<void> {
    await browser.runtime.sendMessage({
      type: "REMOVE_FROM_WHITELIST",
      payload: channelId,
    })
  },

  async isWhitelisted(channelId: string): Promise<boolean> {
    const response = await browser.runtime.sendMessage({
      type: "IS_WHITELISTED",
      payload: channelId,
    })
    return response.isWhitelisted
  },

  async getSessionState(): Promise<Record<string, VideoState>> {
    const response = await browser.runtime.sendMessage({
      type: "GET_SESSION_STATE",
    })
    return response.sessionState
  },

  async updateVideoState(videoId: string, state: VideoState): Promise<void> {
    await browser.runtime.sendMessage({
      type: "UPDATE_VIDEO_STATE",
      payload: { videoId, state },
    })
  },

  async clearSession(): Promise<void> {
    await browser.runtime.sendMessage({
      type: "CLEAR_SESSION",
    })
  },

  async getSettings() {
    const response = await browser.runtime.sendMessage({
      type: "GET_SETTINGS",
    })
    return response.settings
  },

  async updateSettings(settings: any): Promise<void> {
    await browser.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      payload: settings,
    })
  },
}

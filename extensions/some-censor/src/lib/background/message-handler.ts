import { ext } from "@censor/platform/background"
import type { BgBroadcast, BgRequest, BgResponse } from "@censor/types/messages"

import type { ApiClient } from "./api-client"

/**
 * Routes browser.runtime.onMessage requests to ApiClient methods.
 *
 * Returns a Promise<BgResponse> for every message — Firefox requires
 * returning `true` or a Promise from the listener to indicate async response.
 * We return the Promise directly which satisfies this requirement.
 *
 * Also responsible for broadcasting state changes to all YouTube tabs
 * after mutating operations (whitelist add/remove, enabled toggle).
 */
export function createMessageHandler(api: ApiClient) {
  return async (
    msg: BgRequest,
    _sender: browser.runtime.MessageSender
  ): Promise<BgResponse> => {
    try {
      switch (msg.type) {
        case "IS_WHITELISTED": {
          const whitelisted = await api.isWhitelisted(msg.channelId)
          return { ok: true, whitelisted }
        }

        case "GET_WHITELIST": {
          const channels = await api.getWhitelist()
          return { ok: true, channels }
        }

        case "ADD_WHITELIST": {
          await api.addToWhitelist(msg.channelId, msg.channelName)
          await broadcastToYouTubeTabs({
            type: "CHANNEL_WHITELISTED",
            channelId: msg.channelId,
          })
          return { ok: true }
        }

        case "REMOVE_WHITELIST": {
          await api.removeFromWhitelist(msg.channelId)
          return { ok: true }
        }

        case "GET_ENABLED": {
          const settings = await api.getSettings()
          return { ok: true, enabled: settings.enabled }
        }

        case "SET_ENABLED": {
          const settings = await api.putSettings({ enabled: msg.enabled })
          await broadcastToYouTubeTabs({
            type: "ENABLED_CHANGED",
            enabled: settings.enabled,
          })
          return { ok: true, enabled: settings.enabled }
        }

        default: {
          // Exhaustiveness guard — TypeScript will flag unhandled cases
          const _: never = msg
          return {
            ok: false,
            error: `Unknown message type: ${(_ as BgRequest).type}`,
          }
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : ((err as { message?: string }).message ?? "Unknown error")
      // eslint-disable-next-line no-console
      console.error("[BOYO Background] Error handling message:", msg.type, err)
      return { ok: false, error: message }
    }
  }
}

/**
 * Send a broadcast message to all YouTube tabs that have a content script.
 * Tabs without our content script (or not on youtube.com) will silently fail.
 */
async function broadcastToYouTubeTabs(msg: BgBroadcast): Promise<void> {
  const tabs = await ext.tabs.query({ url: "*://www.youtube.com/*" })
  await Promise.allSettled(
    tabs
      .filter((t) => t.id !== undefined)
      .map((t) => ext.tabs.sendMessage(t.id!, msg))
  )
}

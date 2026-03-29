/**
 * popup/messages.ts
 *
 * Typed bridge to the background page message bus.
 *
 * All browser.runtime.sendMessage calls go through here.
 * index.ts never calls the browser API directly.
 *
 * Also exports a listener registration helper for inbound
 * CAPTURE_PROGRESS broadcasts.
 */

import type {
  MessageFromBackground,
  MessageToBackground,
} from "@schedule/shared/types"

export async function sendToBackground(
  msg: MessageToBackground
): Promise<MessageFromBackground> {
  return browser.runtime.sendMessage(msg) as Promise<MessageFromBackground>
}

/**
 * Register a callback for inbound CAPTURE_PROGRESS messages.
 * Returns an unsubscribe function.
 */
export function onProgressMessage(
  callback: (completed: number, total: number) => void
): () => void {
  function listener(message: unknown): undefined {
    const msg = message as MessageFromBackground
    if (msg.kind === "CAPTURE_PROGRESS") {
      callback(msg.completed, msg.total)
    }
    return undefined
  }

  browser.runtime.onMessage.addListener(listener)

  return () => {
    browser.runtime.onMessage.removeListener(listener)
  }
}

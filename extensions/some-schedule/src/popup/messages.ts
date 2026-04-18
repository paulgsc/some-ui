
/**
 * Typed bridge to the background page message bus.
 * index.ts / popup.ts never calls browser.runtime directly.
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

// ── Convenience wrappers ───────────────────────────────────────────────────
// Each returns the typed discriminant directly so callers don't need to
// cast the generic MessageFromBackground.

export async function getSessions(): Promise<MessageFromBackground> {
  return sendToBackground({ kind: "GET_SESSIONS" })
}

export async function deleteSession(session_id: string): Promise<MessageFromBackground> {
  return sendToBackground({ kind: "DELETE_SESSION", session_id })
}

export async function triggerPipeline(session_id: string): Promise<MessageFromBackground> {
  return sendToBackground({ kind: "TRIGGER_PIPELINE", session_id })
}

export async function triggerAllPipeline(): Promise<MessageFromBackground> {
  return sendToBackground({ kind: "TRIGGER_ALL_PIPELINE" })
}

// ── Progress broadcast listener ────────────────────────────────────────────

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
  return () => browser.runtime.onMessage.removeListener(listener)
}

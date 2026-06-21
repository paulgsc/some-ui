import type { MessageBridge, MessageResponseMap } from "@drama/types"

type MessageOf<T extends MessageBridge["type"]> = Extract<
  MessageBridge,
  { type: T }
>

// implicit Generic to handle return type of any
function rawSend<R = unknown>(msg: unknown): Promise<R> {
  return browser.runtime.sendMessage(msg)
}

/**
 * Sends a strongly-typed message across the background/content runtime boundary.
 * Resolves to the full `{ ok, ... }` envelope — callers must narrow on `ok`
 * before reading success fields. `sendMsg` never rejects on an `{ ok: false }`
 * response; that is a successful round-trip carrying an application-level error.
 * It rejects only on transport failure (`browser.runtime.sendMessage` itself
 * throwing/rejecting, e.g. no receiving end).
 */
export async function sendMsg<T extends MessageBridge["type"]>(
  msg: MessageOf<T>
): Promise<MessageResponseMap[T]> {
  return rawSend<MessageResponseMap[T]>(msg)
}

/**
 * Validates whether a target URL matches explicit signature parameters of known streaming platforms.
 */
export function isVideoHost(url: string, hosts: Array<string>): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    return hosts.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

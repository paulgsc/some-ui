import type { MessageBridge } from "@drama/types"

/**
 * Sends a strongly-typed message framework to the background/content runtime boundary.
 */
export async function sendMsg<T>(msg: MessageBridge): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>
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

// Pure: no DOM or browser globals (logic/ layer).

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

// Pure: no DOM or browser globals (logic/ layer).

// Streaming hosts where the drama plays. A tab on one of these is the SOURCE
// tab: content.ts renders no card there and logs beats with its own video
// time; the popup shows its "media detected" banner. Matches the platforms
// content-scraper.ts's networkSelector names; subdomains match too.
export const VIDEO_HOSTS: Array<string> = [
  "netflix.com",
  "viki.com",
  "youtube.com",
  "crunchyroll.com",
]

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

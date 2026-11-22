/**
 * A snip's id, as the capture names it (SNIPS1, `docs/snips.md`):
 * `<surface>:<path>:<viewport>:<appVersion>:<hash12>`, the path a route's
 * address (`/settings/appearance`) or where the release APK's taps reached
 * it (`@studio/takes`). The path may hold a `:`; the three parts after it
 * never do, so the id still reads one way. Its own module, with no imports, so the cut list can
 * name a snip without reading the snip library's schema (`./snip`).
 */

export const SNIP_ID =
  /^(apk|web):(\/\S*|@[a-z0-9-]+(?:\/[a-z0-9-]+)?):([a-z][a-z0-9-]*):([0-9A-Za-z.+-]+):([0-9a-f]{12})$/

/** A commit's id, as a snip's bundle is named by it (`snips-bundle-<commit>`). */
export const COMMIT = /^[0-9a-f]{40}$/

/**
 * A public page's picture, as the pages capture names it (`./page`):
 * where it is (its host and path, as a slug), then the first 12 hex digits
 * of the PNG's SHA-256, so a page that changes gets a new name.
 */
export const PAGE_FILE = /^[a-z0-9][a-z0-9-]{0,95}-[0-9a-f]{12}\.png$/

/**
 * Whether `url` is an address anyone can open: https, with no user or
 * password in it, which a browser would send and a record would keep.
 */
export function isPublicAddress(url: string): boolean {
  if (!/^https:\/\/\S+$/.test(url)) return false
  try {
    const { username, password } = new URL(url)
    return username === "" && password === ""
  } catch {
    return false
  }
}

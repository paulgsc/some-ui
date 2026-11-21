/**
 * A snip's id, as the capture names it (SNIPS1, `docs/snips.md`):
 * `<surface>:<path>:<viewport>:<appVersion>:<hash12>`, the path a route's
 * address (`/settings/appearance`) or where the release APK's taps reached
 * it (`@studio/takes`). Its own module, with no imports, so the cut list can
 * name a snip without reading the snip library's schema (`./snip`).
 */

export const SNIP_ID =
  /^(apk|web):(\/[^:\s]*|@[a-z0-9-]+(?:\/[a-z0-9-]+)?):([a-z][a-z0-9-]*):([0-9A-Za-z.+-]+):([0-9a-f]{12})$/

/** Whether `text` is a snip's id. */
export const isSnipId = (text: string): boolean => SNIP_ID.test(text)

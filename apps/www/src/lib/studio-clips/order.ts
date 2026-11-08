import type { Clip } from "@some-ui/video-render"

/** The newest landed first, then by title, so the order is the same each read. */
export const newestFirst = (clips: ReadonlyArray<Clip>): Array<Clip> =>
  [...clips].sort(
    (a, b) =>
      b.landed.localeCompare(a.landed) || a.title.localeCompare(b.title, "en")
  )

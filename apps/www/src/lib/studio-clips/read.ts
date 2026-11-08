/**
 * Studio's clips, read (SFEED7): one `GET` of paulgsc/testing's public
 * `clips/index.json` (`@some-ui/video-render`'s `ClipIndexSchema`), through
 * the shared fetch client, carrying no account. A folder not made yet is no
 * clips, not a failure.
 */
import { apiClient, ApiError } from "@some-ui/fetch-kit"
import type { Clip } from "@some-ui/video-render"
import { ClipIndexSchema, clipPath } from "@some-ui/video-render"

import { newestFirst } from "./order"

const CLIPS = "https://raw.githubusercontent.com/paulgsc/testing/main/clips"

/** Where a file of clip `id` is served, for an `<img>` or a video. */
export const clipUrl = (id: string, file: string): string =>
  `${CLIPS}/${clipPath(id, file)}`

/** Every clip kept, the newest first; rejects when the index can't be read. */
export async function readStudioClips(): Promise<Array<Clip>> {
  try {
    const index = await apiClient.get(
      new URL(`${CLIPS}/index.json`),
      { credentials: "omit" },
      ClipIndexSchema
    )
    return newestFirst(index.clips)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return []
    throw e
  }
}

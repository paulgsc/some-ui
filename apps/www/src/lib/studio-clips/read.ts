/**
 * Studio's clips, read (SFEED7): one `GET` of paulgsc/testing's public
 * `clips/index.json` (`@some-ui/video-render`'s `ClipIndexSchema`), through
 * the shared fetch client, carrying no account. The host serves JSON as
 * text, so it is read as JSON whatever its type says. A folder not made yet
 * is no clips, not a failure.

 */
import { apiClient, ApiError } from "@some-ui/fetch-kit"
import type { Clip } from "@some-ui/video-render"
import { ClipIndexSchema, TESTING_DATA } from "@some-ui/video-render"

import { PUBLIC_READ } from "@/lib/file-host-config"

import { newestFirst } from "./order"

/** Every clip kept, the newest first; rejects when the index can't be read. */
export async function readStudioClips(): Promise<Array<Clip>> {
  try {
    const index = await apiClient.get(
      new URL(`${TESTING_DATA}/clips/index.json`),
      { ...PUBLIC_READ, responseAs: "json" },
      ClipIndexSchema
    )
    return newestFirst(index.clips)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return []
    throw e
  }
}

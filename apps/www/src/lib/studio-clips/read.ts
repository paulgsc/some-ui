/**
 * Studio's clips, read (SFEED7): one `GET` of paulgsc/testing's public
 * `clips/index.json` (`@some-ui/video-render`'s `ClipIndexSchema`), through
 * the shared fetch client, carrying no account. The host serves JSON as
 * text, so it is read as JSON whatever its type says. A folder not made yet
 * is no clips, not a failure.
 *
 * Each frame is read from home, where the frames are kept (owner,
 * 2026-11-11), through the link (`lib/home-link/clips`): `readClipFrame`.
 */
import { apiClient, ApiError } from "@some-ui/fetch-kit"
import type { Clip } from "@some-ui/video-render"
import { ClipIndexSchema, TESTING_DATA } from "@some-ui/video-render"

import { PUBLIC_READ } from "@/lib/file-host-config"
import { askClipFrame } from "@/lib/home-link/clips"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import type { FrameShown } from "./frames"
import { readFrame } from "./frames"
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

/** One frame of clip `id`, from home; never rejects. */
export async function readClipFrame(
  id: string,
  side: "before" | "after",
  file: string
): Promise<FrameShown> {
  const asked = await askWhileBusy(() => askClipFrame(id, side, file))
  if (asked.kind === "unpaired") return asked
  if (asked.kind === "unreachable") return { kind: "away" }
  return readFrame(asked.answer)
}

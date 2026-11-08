/**
 * A video brought from home to the phone a part at a time (ST38, FEED4;
 * SFEED12's previews too): at most `partBytes` a request, each written to
 * the phone's file as it comes, so a video is never held whole. Stops,
 * writing nothing more, once `stopped` says so.
 */
import type { Fetch, PartRead } from "./model"
import type { VideoFiles } from "./runtime"

/** The most bytes of a video one request asks for: about 4 MB. */
export const PART_BYTES = 4 * 1024 * 1024

/** Bytes of base64 text, without decoding it. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

/** Where the phone keeps a whole copy of `key`'s video (`bytes` long), or `null`. */
export async function keptCopy(
  files: VideoFiles,
  key: string,
  bytes: number
): Promise<{ uri: string; src: string } | null> {
  const size = await files.size(key)
  if (size !== bytes) return null
  return files.where(key)
}

export type BringPorts = {
  files: VideoFiles
  /** Bytes `start` to `end` of the video, or why there are none. */
  part: (
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  partBytes: number
  stopped: () => boolean
  /** Where the video stands on the phone, each time that moves. */
  moved: (fetch: Fetch) => void
}

/**
 * Brings `key`'s video, `total` bytes, to the phone: ready at once when a
 * whole copy is kept, else a part at a time, then ready, or failed with
 * why. Says nothing more once `stopped` says so.
 */
export async function bringVideo(
  ports: BringPorts,
  key: string,
  total: number
): Promise<void> {
  /** Whether the fetch is over: a whole copy is kept (and said), or it was stopped. */
  const ready = async (): Promise<boolean> => {
    const where = await keptCopy(ports.files, key, total)
    if (ports.stopped()) return true
    if (where === null) return false
    ports.moved({ kind: "ready", ...where })
    return true
  }
  if (ports.stopped() || (await ready())) return
  for (let start = 0; start < total; ) {
    const end = Math.min(start + ports.partBytes, total) - 1
    const part = await ports.part(start, end)
    if (ports.stopped()) return
    if (part.kind !== "bytes") {
      ports.moved({
        kind: "failed",
        why: part.kind === "gone" ? "gone" : "away",
      })
      return
    }
    // Android's base64 may be wrapped in lines.
    const base64 = part.base64.replace(/\s/g, "")
    const got = decodedBytes(base64)
    if (got <= 0 || got > end - start + 1) {
      ports.moved({ kind: "failed", why: "away" })
      return
    }
    const put = await ports.files.put(key, base64, start === 0)
    if (ports.stopped()) return
    if (!put) {
      ports.moved({ kind: "failed", why: "phone" })
      return
    }
    start += got
    ports.moved({ kind: "fetching", done: start, total })
  }
  if (!(await ready())) ports.moved({ kind: "failed", why: "phone" })
}

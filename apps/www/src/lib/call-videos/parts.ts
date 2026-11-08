/**
 * A video brought from home to the phone a part at a time (ST38, FEED4;
 * SFEED12's previews too): at most `partBytes` a request, each written to
 * the phone's file as it comes, so a video is never held whole. Stops,
 * writing nothing more, once `stopped` says so. Studio's feed videos and a
 * template's preview both bring theirs through `bringVideo`.
 */
import type { Fetch, FetchFailure, PartRead } from "./model"
import type { VideoFiles } from "./runtime"

type PartPorts = {
  /** Bytes `start` to `end` of the video, or why there are none. */
  part: (
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  /** Writes (`first`) or appends a part, as base64; false if it couldn't. */
  put: (base64: string, first: boolean) => Promise<boolean>
  partBytes: number
  stopped: () => boolean
  /** How many bytes the phone has so far. */
  moved: (done: number) => void
}

/** Bytes of base64 text, without decoding it. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

/** Brings `total` bytes over; never rejects unless a port does. */
async function fetchParts(
  ports: PartPorts,
  total: number
): Promise<"done" | "stopped" | FetchFailure> {
  for (let start = 0; start < total; ) {
    const end = Math.min(start + ports.partBytes, total) - 1
    const part = await ports.part(start, end)
    if (ports.stopped()) return "stopped"
    if (part.kind !== "bytes") return part.kind === "gone" ? "gone" : "away"
    // Android's base64 may be wrapped in lines.
    const base64 = part.base64.replace(/\s/g, "")
    const got = decodedBytes(base64)
    if (got <= 0 || got > end - start + 1) return "away"
    const put = await ports.put(base64, start === 0)
    if (ports.stopped()) return "stopped"
    if (!put) return "phone"
    start += got
    ports.moved(start)
  }
  return "done"
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
  part: PartPorts["part"]
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
  const ended = await fetchParts(
    {
      part: ports.part,
      put: (base64, first) => ports.files.put(key, base64, first),
      partBytes: ports.partBytes,
      stopped: ports.stopped,
      moved: (done) => {
        ports.moved({ kind: "fetching", done, total })
      },
    },
    total
  )
  if (ended === "stopped") return
  if (ended !== "done") {
    ports.moved({ kind: "failed", why: ended })
    return
  }
  if (!(await ready())) ports.moved({ kind: "failed", why: "phone" })
}

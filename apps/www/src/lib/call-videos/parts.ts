/**
 * A video brought from home to the phone a part at a time (ST38, FEED4;
 * SFEED12's previews too): at most `partBytes` a request, each written to
 * the phone's file as it comes, so a video is never held whole. Stops,
 * writing nothing more, once `stopped` says so.
 */
import type { FetchFailure, PartRead } from "./model"

export type PartPorts = {
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
export async function fetchParts(
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

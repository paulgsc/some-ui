/**
 * What the landing needs to know of a slot's file before it shows it (PAGES,
 * #3401; C1064), read from its bytes when the site is built: its size, so
 * the card takes the picture's own shape and nothing is cropped or padded,
 * and, for a clip, whether it carries sound, which the landing never plays.
 * Pure: bytes in, facts out. Only the boxes these need are read, so a file
 * this can't read is simply not shown (`null`).
 */

/** A picture's size in pixels. */
export type MediaSize = { readonly width: number; readonly height: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const u32 = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) * 0x1000000 +
  (((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0))

const fourcc = (b: Uint8Array, at: number): string =>
  String.fromCharCode(
    b[at] ?? 0,
    b[at + 1] ?? 0,
    b[at + 2] ?? 0,
    b[at + 3] ?? 0
  )

/** A PNG's size, from its IHDR; null for anything else. */
export function pngSize(bytes: Uint8Array): MediaSize | null {
  if (bytes.length < 24) return null
  if (PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) return null
  if (fourcc(bytes, 12) !== "IHDR") return null
  const width = u32(bytes, 16)
  const height = u32(bytes, 20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** One ISO base-media box: its type, and where its body starts and ends. */
type Box = {
  readonly type: string
  readonly body: number
  readonly end: number
}

/** The boxes laid one after another in `bytes[from, to)`. */
function boxes(bytes: Uint8Array, from: number, to: number): Array<Box> {
  const found: Array<Box> = []
  let at = from
  while (at + 8 <= to) {
    let size = u32(bytes, at)
    const type = fourcc(bytes, at + 4)
    let body = at + 8
    if (size === 1) {
      // A 64-bit size; the boxes this reads are never that large.
      if (u32(bytes, at + 8) !== 0) return found
      size = u32(bytes, at + 12)
      body = at + 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < body - at || at + size > to) return found
    found.push({ type, body, end: at + size })
    at += size
  }
  return found
}

const child = (bytes: Uint8Array, box: Box, type: string): Box | undefined =>
  boxes(bytes, box.body, box.end).find((b) => b.type === type)

/** Each track of an MP4's `moov`: its handler (`vide`, `soun`, …) and its header. */
function tracks(
  bytes: Uint8Array
): Array<{ readonly handler: string; readonly tkhd: Box | undefined }> {
  const moov = boxes(bytes, 0, bytes.length).find((b) => b.type === "moov")
  if (moov === undefined) return []
  return boxes(bytes, moov.body, moov.end)
    .filter((b) => b.type === "trak")
    .map((trak) => {
      const mdia = child(bytes, trak, "mdia")
      const hdlr = mdia === undefined ? undefined : child(bytes, mdia, "hdlr")
      // hdlr: version and flags (4), pre_defined (4), then the handler type.
      const handler = hdlr === undefined ? "" : fourcc(bytes, hdlr.body + 8)
      return { handler, tkhd: child(bytes, trak, "tkhd") }
    })
}

/** An MP4's picture size, from its video track's header; null if it has none. */
export function mp4Size(bytes: Uint8Array): MediaSize | null {
  const video = tracks(bytes).find((t) => t.handler === "vide")
  if (video?.tkhd === undefined) return null
  // tkhd ends with its display matrix (nine 32-bit values) and then width
  // and height, each 16.16 fixed point. A matrix whose first value is 0
  // turns the picture a quarter, so it shows with its sides swapped.
  const { end } = video.tkhd
  const width = Math.round(u32(bytes, end - 8) / 65536)
  const height = Math.round(u32(bytes, end - 4) / 65536)
  if (width <= 0 || height <= 0) return null
  const turned = u32(bytes, end - 44) === 0 && u32(bytes, end - 40) !== 0
  return turned ? { width: height, height: width } : { width, height }
}

/** Whether an MP4 carries a sound track: the landing refuses one that does. */
export function mp4HasSound(bytes: Uint8Array): boolean {
  return tracks(bytes).some((t) => t.handler === "soun")
}

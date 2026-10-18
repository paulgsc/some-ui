/**
 * The plate (QD12, #1804): the values `styles/content.css` paints over a
 * plated card's thumbnail and channel photo, from ids and the channel's
 * display name, never the image (`docs/absent-plated-heard.md` §3).
 */

import type { Observation } from "@censor/lib/content/core/observation"
import { fnv1a } from "@some-extension/common"

/** CSS colours for the fill and the disc, and the disc's letter. */
export type Plate = {
  readonly fill: string
  readonly disc: string
  readonly initial: string
}

type PlateInputs = Pick<Observation, "videoId" | "channelId" | "channelName">

export function plateOf({
  videoId,
  channelId,
  channelName,
}: PlateInputs): Plate {
  return {
    fill: tone(videoId),
    disc: tone(channelId ?? channelName ?? videoId),
    initial: initial(channelName),
  }
}

/** A muted tone for an id (§3). */
function tone(id: string): string {
  const h = fnv1a(id)
  const saturation = 10 + ((h >>> 9) % 8)
  const lightness = 17 + ((h >>> 13) % 6)
  return `hsl(${h % 360} ${saturation}% ${lightness}%)`
}

/** The name's first letter or digit, punctuation and symbols skipped. */
function initial(name: string | null): string {
  return name?.match(/[\p{L}\p{N}]/u)?.[0].toLocaleUpperCase() ?? ""
}

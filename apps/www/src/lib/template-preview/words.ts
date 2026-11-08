/**
 * What a template's preview says on the Templates page (SFEED12, #2757):
 * every word in one pure table, in the person's terms, held by its test to
 * no machinery (`MACHINERY`). What bringing a video to the phone says is
 * Studio's feed videos' (`VIDEOS_WORDS`), shared.
 */
import { VIDEOS_WORDS } from "@/lib/call-videos/words"

import type { MakeFailure, PreviewStanding } from "./model"

/** A moment, as the phone's clock reads it: "Sun 9:05 AM". */
function moment(unixSeconds: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(unixSeconds * 1000))
}

export const PREVIEW_WORDS = {
  heading: "Preview",
  /** What a drag down reads again. */
  what: "this template's preview",
  intro:
    "Home makes a short video of this template from its sample words, the way it makes an episode. It's only a preview: it's never an episode, and home lets it go a day after it's made.",
  make: "Make a preview",
  asking: "Asking home…",
  none: "There's no preview of this template yet.",
  standing: {
    waiting: "Home will make the preview once it's free.",
    rendering: "Home is making the preview.",
    paused: "Home paused the preview while you use it, and carries on after.",
    "given-way":
      "Home set the preview aside to make room, and will start it again.",
    ready: "The preview is ready.",
    failed: "Home couldn't make the preview. Make another to try again.",
  } satisfies Record<PreviewStanding, string>,
  /** When a ready preview was made, and when home lets it go. */
  kept: (madeAt: number, expiresAt: number, timeZone?: string): string =>
    `Made ${moment(madeAt, timeZone)}. Home lets it go ${moment(expiresAt, timeZone)}.`,
  makeFailed: {
    unpaired: "Pair this phone with home to make a preview.",
    away: "Home didn't answer, so no preview was asked for. Try again.",
    older: "Home doesn't make previews yet. Update home, then try again.",
    unreadable: "Home's answer couldn't be read. Try again.",
  } satisfies Record<MakeFailure, string>,
  unpaired: "Pair this phone with home to see this template's preview.",
  older: "Home doesn't make previews yet. Update home, then try again.",
  reading: VIDEOS_WORDS.reading,
  away: VIDEOS_WORDS.away,
  unreadable: VIDEOS_WORDS.unreadable,
  tryAgain: VIDEOS_WORDS.tryAgain,
  watch: VIDEOS_WORDS.watch,
  bringing: VIDEOS_WORDS.bringing,
  fetchFailed: VIDEOS_WORDS.failed,
} as const

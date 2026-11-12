/**
 * What a template's preview says on the Templates page (SFEED12, #2757):
 * every word in one pure table, in the person's terms, held by its test to
 * no machinery (`MACHINERY`). What bringing a video to the phone says is
 * Studio's feed videos' (`VIDEOS_WORDS`), shared.
 */
import { VIDEOS_WORDS } from "@/lib/call-videos/words"

import type { MakeFailure, PreviewStanding, ReadFailure } from "./model"

const OLDER = "Home doesn't make previews yet. Update home, then try again."

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
    "A preview is a short video of this template, made by home from its sample words the way it makes an episode. Home keeps only the newest, and lets it go on its own.",
  make: "Make a preview",
  /**
   * The question before home is asked (#2899): what it will make, that
   * nothing is posted, and what it takes the place of.
   */
  confirm: {
    title: (template: string): string => `Make a preview of ${template}?`,
    description:
      "Home makes a short video of this template from its sample words, the way it makes an episode. Nothing is posted. Home keeps only the newest preview, so this one takes the place of any it has.",
    confirm: "Make the preview",
    keep: "Not now",
  },
  /** Said over the page once home took the press, with the way to Renders. */
  asked: (template: string): string =>
    `Home is making a preview of ${template}. Renders shows it while it's made, and once it's ready.`,
  seeRenders: "See it on Renders",
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
  /** Why home couldn't make one, where it says a reason the person can act on. */
  failedWhy: (reason: string | undefined): string | null =>
    reason === "no-sample"
      ? "This template has no sample yet, so it can't be previewed."
      : null,
  /** When a ready preview was made, and when home lets it go. */
  kept: (madeAt: number, expiresAt: number, timeZone?: string): string =>
    `Made ${moment(madeAt, timeZone)}. Home lets it go ${moment(expiresAt, timeZone)}.`,
  makeFailed: {
    unpaired: "Pair this phone with home to make a preview.",
    away: "Home didn't answer, so no preview was asked for. Try again.",
    older: OLDER,
    unreadable: VIDEOS_WORDS.unreadable,
  } satisfies Record<MakeFailure, string>,
  readFailed: {
    away: "Home didn't answer, so this is the preview as last read.",
    unreadable:
      "Home's answer couldn't be read, so this is the preview as last read.",
  } satisfies Record<ReadFailure, string>,
  unpaired: "Pair this phone with home to see this template's preview.",
  older: OLDER,
  reading: VIDEOS_WORDS.reading,
  away: VIDEOS_WORDS.away,
  unreadable: VIDEOS_WORDS.unreadable,
  tryAgain: VIDEOS_WORDS.tryAgain,
} as const

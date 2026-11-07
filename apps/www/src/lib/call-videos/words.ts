/**
 * What Studio's Calls says (ST38): every word in one pure table, in the
 * person's terms, held by its test to no machinery (`MACHINERY`).
 */
import type { FetchFailure } from "./model"

/** A share of `done` of `total`, below a hundred until it is whole. */
export function share(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(99, Math.floor((done / total) * 100))
}

export const CALLS_WORDS = {
  open: "The weekly call's videos",
  heading: "The weekly call",
  intro:
    "Home makes each week's video. Watch it here, share it to YouTube, then save its link, and the week can be let go from My data.",
  back: "Back to Studio",
  reading: "Reading what home has…",
  unpaired: "Pair this phone with home to see the call's videos.",
  away: "Home didn't answer. Try again in a moment.",
  older:
    "Home doesn't keep the call's videos yet. Update home, then try again.",
  unreadable: "Home's answer couldn't be read. Try again.",
  none: "Home hasn't made a video of the call yet.",
  tryAgain: "Try again",
  week: (from: string, to: string): string => `${from} to ${to}`,
  waiting: "Home is still making this week's video.",
  watch: "Watch",
  bringing: (done: number, total: number): string =>
    `Bringing it to the phone, ${String(share(done, total))}%`,
  failed: {
    away: "Home stopped answering. Watch again to start over.",
    gone: "Home no longer has this video.",
    phone:
      "The phone couldn't keep the video. Free some space and watch again.",
  } satisfies Record<FetchFailure, string>,
  share: "Share to YouTube",
  shareTitle: (from: string): string => `The weekly call, the week of ${from}`,
  shareFailed: "The share sheet didn't open. Try again.",
  linkLabel: "Its YouTube link",
  linkHint: "Paste the link YouTube gives the video once it's up.",
  save: "Save the link",
  saving: "Saving…",
  notAVideo: "That isn't a link to a YouTube video.",
  linkAway: "Home didn't answer, so the link isn't saved. Try again.",
  linkSaved: "Saved. Home keeps the link with the week.",
  onYouTube: "Watch on YouTube",
  letGo: "You let home's copy go. The week lives on YouTube.",
} as const

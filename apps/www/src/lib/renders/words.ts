/**
 * What Studio › Renders says (SFEED13, #2761): every word in one pure table,
 * in the person's terms, held by its test to no machinery (`MACHINERY`): no
 * job, lane, state name or code reaches the screen. The estimate is an
 * estimate and says so, like an installer's bar.
 */
import { assertNever } from "@some-ui/core-utils"

import { FEED_WORDS } from "@/lib/call-videos/words"
import { isFeed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index/words"

import type { Board, HeldBy, Now, RenderFailed } from "./model"

/** A feed's name, or what a render of another kind is. */
export function feedName(feed: string): string {
  return isFeed(feed)
    ? FEED_FACTS[feed].name
    : feed === "preview"
      ? "A preview"
      : "Something else"
}

/** An episode by its days or its season and week; a preview by its template. */
export function episodeName(feed: string, key: string): string {
  if (isFeed(feed)) return FEED_WORDS[feed].label(key)
  if (feed === "preview") return "A short preview of a template"
  return "An episode"
}

/** Why it waits, in the person's terms. */
const HELD_WORDS: Record<HeldBy, string> = {
  busy: "Paused while you record or hear a note; it picks up again by itself.",
  memory: "Waiting for room on home; it starts by itself once there is.",
  pressure: "Waiting for home to settle; it starts by itself once it has.",
  settling: "Room came back; it starts in a moment.",
  unknown: "Waiting until home can tell it has room.",
  clear: "About to start.",
  silent: "Home isn't saying how it's going right now. Check again in a while.",
}

/** About how long, rounded so it never reads as exact. */
export function roughly(seconds: number): string {
  if (seconds < 90) return "about a minute"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `about ${String(minutes)} minutes`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? "about an hour" : `about ${String(hours)} hours`
}

/** A day home expects something, as a person reads it. */
export function dayOf(on: string): string {
  const [year = 0, month = 1, day = 1] = on.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export type NowLines = {
  readonly title: string
  readonly line: string
  /** 0 to 100 for the bar, or `null` for a bar that moves without a share. */
  readonly percent: number | null
  readonly left: string | null
}

/** What home is making, and how far along, roughly. */
export function nowLines(now: Now): NowLines {
  const title = `${feedName(now.feed)}: ${episodeName(now.feed, now.key)}`
  const share =
    now.estimate === null
      ? null
      : Math.min(95, Math.round(now.estimate.share * 100))
  const left =
    now.estimate === null
      ? null
      : now.estimate.secondsLeft === null
        ? "Nearly there."
        : `${roughly(now.estimate.secondsLeft)} left, roughly.`
  switch (now.state) {
    case "rendering": {
      return now.heldBy === null || now.heldBy === "clear"
        ? { title, line: "Making it now.", percent: share, left }
        : { title, line: HELD_WORDS[now.heldBy], percent: share, left: null }
    }
    case "finishing": {
      return {
        title,
        line: "Putting the finished video in place.",
        percent: 100,
        left: null,
      }
    }
    case "paused": {
      return {
        title,
        line: HELD_WORDS[now.heldBy ?? "busy"],
        percent: share,
        left: null,
      }
    }
    case "waiting": {
      const line = now.stuck
        ? "Home hasn't had room for this one for a while. It keeps waiting, and you'll hear if it never fits."
        : HELD_WORDS[now.heldBy ?? "unknown"]
      return { title, line, percent: share, left: null }
    }
    default: {
      return assertNever(now.state)
    }
  }
}

/** What stopped a render, in the person's terms. */
export function failedLine(failed: RenderFailed): string {
  return failed.by === "home"
    ? "Home couldn't keep its files. It tries again in an hour."
    : "It couldn't be made this time. Home tries again in an hour, and keeps what it had finished."
}

/** The one line above Studio's tiles. */
export function liveLine(board: Board): string | null {
  const now = board.now
  if (now === null)
    return board.waiting.length > 0
      ? "Home has videos waiting to be made."
      : null
  const name = `${feedName(now.feed)}, ${episodeName(now.feed, now.key)}`
  switch (now.state) {
    case "rendering":
    case "finishing": {
      return `Home is making ${name}.`
    }
    case "paused": {
      return `Home paused ${name}; it picks up again by itself.`
    }
    case "waiting": {
      return `${name} waits for room on home.`
    }
    default: {
      return assertNever(now.state)
    }
  }
}

export const RENDERS_WORDS = {
  heading: "Renders",
  intro:
    "What home is making for your feeds, what waits its turn, and what's coming. Home makes videos only when it has room, so the times are rough.",
  now: "Now",
  nothingNow: "Nothing is being made right now.",
  waiting: "Waiting its turn",
  nothingWaiting: "Nothing waits.",
  failed: "Couldn't finish",
  done: "Finished lately",
  coming: "Coming",
  expected: (on: string): string => `Expected ${dayOf(on)}.`,
  nothingComing: "Nothing is expected soon.",
  gaveWay: (times: number): string =>
    times === 1
      ? "It gave way once and picked up again."
      : `It gave way ${String(times)} times and picked up again.`,
  reading: "Asking home…",
  away: "Home didn't answer. It may be off, or away from this network.",
  older:
    "Home doesn't say what it's making yet. It will after its next update.",
  unreadable: "Home's answer couldn't be read.",
  unpaired: "Pair this phone with home to see what it's making.",
  tryAgain: "Try again",
  open: "See what home is making",
} as const

/**
 * What Studio › Renders says (SFEED13, #2761): every word in one pure table,
 * in the person's terms, held by its test to no machinery (`MACHINERY`): no
 * job, lane, state name or code reaches the screen. The estimate is an
 * estimate and says so, like an installer's bar.
 */
import { assertNever } from "@some-ui/core-utils"
import { templateFormat } from "@some-ui/video-render"

import { FEED_WORDS } from "@/lib/call-videos/words"
import { isFeed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index/words"
import { PREVIEW_WORDS } from "@/lib/template-preview/words"

import type { Board, HeldBy, Now, RenderEpisode, RenderFailed } from "./model"
import type { Row, Subject } from "./subject"
import { subjectOf } from "./subject"

/** A feed's name, or what a render of another kind is. */
export function feedName(feed: string): string {
  return isFeed(feed) ? FEED_FACTS[feed].name : "Something else"
}

/** What kind of thing a row is: its feed's name, a preview, a clip's walk. */
export function kindName(subject: Subject): string {
  switch (subject.kind) {
    case "episode": {
      return FEED_FACTS[subject.feed].name
    }
    case "preview": {
      return "Preview"
    }
    case "walk": {
      return "A clip's walk-through"
    }
    case "other": {
      return "Something else"
    }
    default: {
      return assertNever(subject)
    }
  }
}

/** The thing itself: an episode's days or week, a preview's template. */
export function thingName(subject: Subject): string {
  switch (subject.kind) {
    case "episode": {
      return FEED_WORDS[subject.feed].label(subject.key)
    }
    case "preview": {
      return subject.template === null
        ? "A preview of a template"
        : `A preview of ${templateFormat(subject.template).title}`
    }
    case "walk": {
      return `The ${subject.side} side of a clip`
    }
    case "other": {
      return "A video"
    }
    default: {
      return assertNever(subject)
    }
  }
}

/**
 * A render named whole, in the person's terms (#2899): an episode by its
 * feed, then its days or week; a preview by its template, never its key.
 */
export function renderName(row: Row): string {
  const subject = subjectOf(row)
  return subject.kind === "preview"
    ? thingName(subject)
    : `${kindName(subject)}: ${thingName(subject)}`
}

/** What the page's link to `subject`'s own page says. */
export function openWords(subject: Subject): string | null {
  switch (subject.kind) {
    case "episode": {
      return "Open the episode"
    }
    case "preview": {
      return subject.template === null ? null : "Open the template's preview"
    }
    case "walk": {
      return "Open the clip"
    }
    case "other": {
      return null
    }
    default: {
      return assertNever(subject)
    }
  }
}

/**
 * The line under a finished render, where it has one: when home lets a
 * preview go.
 */
export function doneLine(
  done: RenderEpisode,
  timeZone?: string
): string | null {
  return done.feed === "preview" && done.expiresAt !== undefined
    ? PREVIEW_WORDS.kept(done.at, done.expiresAt, timeZone)
    : null
}

/** Why it waits, in the person's terms. */
const HELD_WORDS: Record<HeldBy, string> = {
  busy: "Paused while home does something you're waiting on; it picks up again by itself.",
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
  const title = renderName(now)
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
  // A preview is made once a person asks, never again on its own.
  if (failed.feed === "preview")
    return (
      PREVIEW_WORDS.failedWhy(failed.reason) ?? PREVIEW_WORDS.standing.failed
    )
  return failed.by === "home"
    ? "Home couldn't keep its files. It tries again in an hour."
    : "It couldn't be made this time. Home tries again in an hour, and keeps what it had finished."
}

/** How home's renders stand at a glance, for Settings › Status's mark. */
export type RenderShape = "making" | "paused" | "waiting" | "failed" | "quiet"

/** What `board` comes to at a glance: what's under way, else what's left. */
export function renderShape(board: Board): RenderShape {
  const now = board.now
  if (now === null) {
    if (board.waiting.length > 0) return "waiting"
    return board.failed.length > 0 ? "failed" : "quiet"
  }
  switch (now.state) {
    case "rendering":
    case "finishing": {
      return "making"
    }
    case "paused": {
      return "paused"
    }
    case "waiting": {
      return "waiting"
    }
    default: {
      return assertNever(now.state)
    }
  }
}

/** Each shape's word beside its mark, and its legend line. */
export const SHAPE_WORDS = {
  name: "Videos home makes",
  words: {
    making: "Making",
    paused: "Paused",
    waiting: "Waiting for room",
    failed: "Couldn't finish",
    quiet: "Nothing now",
  } satisfies Record<RenderShape, string>,
  legend: {
    making: "Home is making a video now",
    paused: "Home gave way for a while and picks up again by itself",
    waiting: "A video waits for home to have room",
    failed: "A video couldn't be made lately",
    quiet: "Home isn't making anything right now",
  } satisfies Record<RenderShape, string>,
} as const

/** The one line above Studio's tiles, for any board home answers. */
export function liveLine(board: Board): string {
  const now = board.now
  if (now === null) {
    if (board.waiting.length > 0) return "Videos wait to be made."
    if (board.failed.length > 0)
      return board.failed.length === 1
        ? "A video couldn't be made."
        : `${String(board.failed.length)} videos couldn't be made.`
    return "Home isn't making anything right now."
  }
  const name = renderName(now)
  switch (now.state) {
    case "rendering":
    case "finishing": {
      return `Making: ${name}.`
    }
    case "paused": {
      return `Paused: ${name}. It picks up again by itself.`
    }
    case "waiting": {
      return `Waiting for room: ${name}.`
    }
    default: {
      return assertNever(now.state)
    }
  }
}

export const RENDERS_WORDS = {
  heading: "Renders",
  intro:
    "What home is making for your feeds and templates, what waits its turn, what it finished, and what's coming. Each opens its own page. Home makes videos only when it has room, so the times are rough.",
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
  stale: "Home didn't answer just now. This is what it said last.",
  away: "Home didn't answer, or its answer couldn't be read. It may be off, or away from this network.",
  older:
    "Home doesn't say what it's making yet. It will after its next update.",
  unpaired: "Pair this phone with home to see what it's making.",
  open: "See what home is making",
  lineUntilRead: "Home's renders",
} as const

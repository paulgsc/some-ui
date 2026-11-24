/**
 * What Studio › Renders says (SFEED13, #2761): every word in one pure table,
 * in the person's terms, held by its test to no machinery (`MACHINERY`): no
 * job, lane, state name or code reaches the screen. The estimate is an
 * estimate and says so, like an installer's bar.
 */
import { assertNever } from "@some-ui/core-utils"
import { templateFormat } from "@some-ui/video-render"

import { FEED_WORDS } from "@/lib/call-videos/words"
import { dayOf, essayName } from "@/lib/cards-essay-key"
import type { Feed } from "@/lib/feeds"
import { isFeed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index/words"
import { PREVIEW_WORDS } from "@/lib/template-preview/words"

import type {
  Board,
  Coming,
  HeldBy,
  Now,
  Refusal,
  RenderEpisode,
  RenderFailed,
  WaitsOn,
} from "./model"
import { refusalOf } from "./model"
import type { Row, Subject } from "./subject"
import { subjectOf } from "./subject"

/** The board's rows that are no feed's: what `kindName` and `feedName` call them. */
const OWN_ROWS = {
  preview: "Preview",
  "clip-walk": "A clip's walk-through",
} as const

const isOwnRow = (feed: string): feed is keyof typeof OWN_ROWS =>
  Object.hasOwn(OWN_ROWS, feed)

/**
 * A feed's name: the phone's own for a feed it knows, else home's name for
 * it said as words (`new-feed` is "New feed"), so a row from a feed this
 * phone doesn't know yet still says which it is (#3235).
 */
export function feedName(feed: string): string {
  if (isFeed(feed)) return FEED_FACTS[feed].name
  if (isOwnRow(feed)) return OWN_ROWS[feed]
  const words = feed.replaceAll(/[-_]+/g, " ").trim()
  return words === ""
    ? "Something else"
    : words.charAt(0).toUpperCase() + words.slice(1)
}

/** What kind of thing a row is: its feed's name, a preview, a clip's walk. */
export function kindName(subject: Subject): string {
  switch (subject.kind) {
    case "episode": {
      return FEED_FACTS[subject.feed].name
    }
    case "preview": {
      return OWN_ROWS.preview
    }
    case "walk": {
      return OWN_ROWS["clip-walk"]
    }
    case "essay": {
      return "Cards essay"
    }
    case "other": {
      return feedName(subject.feed)
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
    case "essay": {
      return essayName(subject.key)
    }
    case "other": {
      return "A video this phone can't open yet"
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
    case "essay": {
      return "Open the essay"
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

/** Each feed's videos, as the limit on their length is said of them. */
const FEED_VIDEOS = {
  call: "the call's videos",
  "cards-essay": "cards essays",
  "interview-essay": "interview essays",
  "playoff-delta": "Playoff Delta videos",
  report: "engagement reports",
  "rust-essay": "Rust Rounds essays",
} as const satisfies Record<Feed, string>

/**
 * A length to the tenth of a minute, as a person says it: "24.4 minutes",
 * "30 minutes", "1 hour 52 minutes" (never a number of three digits).
 */
export function minutesSaid(minutes: number): string {
  const tenths = Math.round(minutes * 10) / 10
  const plural = (n: number, one: string): string =>
    `${String(n)} ${one}${n === 1 ? "" : "s"}`
  if (tenths < 60) return plural(tenths, "minute")
  const whole = Math.round(tenths)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0
    ? plural(hours, "hour")
    : `${plural(hours, "hour")} ${plural(rest, "minute")}`
}

/** How much larger than the cap, in a person's terms (never "MB"). */
function largerSaid(mb: number, capMb: number): string {
  if (mb >= capMb * 2) return "at least twice as large as"
  const share = ((mb - capMb) / capMb) * 100
  return share < 1
    ? "a little larger than"
    : `${String(Math.min(99, Math.round(share)))}% larger than`
}

/**
 * What the render policy refused, and that home leaves it be (RNR1;
 * paulgsc/server#937 holds a refusal until what it was made from, its cap
 * or home's way of making videos changes, so "as it is" is true).
 */
const REFUSAL_WORDS = {
  tooLong: (feed: string, minutes: number, capMinutes: number): string => {
    const videos = isFeed(feed) ? FEED_VIDEOS[feed] : "videos like it"
    const cap = minutesSaid(capMinutes)
    // Sent in tenths, a length just past its cap can read as the cap itself.
    const run =
      minutesSaid(minutes) === cap
        ? `a little past ${cap}, where ${videos} stop`
        : `${minutesSaid(minutes)}, and ${videos} stop at ${cap}`
    return `Too long to make: it would run ${run}. Home doesn't try it again as it is.`
  },
  tooLarge: (mb: number, capMb: number): string =>
    `Too large to keep: it came out ${largerSaid(mb, capMb)} home keeps a video. Home doesn't try it again as it is.`,
  /**
   * Scenes too full for their frame, by the names home gives (`sceneNames`),
   * the rest counted; by count alone where home names none, never by the
   * recorder's ids (the owner, 2026-11-23: "which scene, by its name").
   */
  overflow: (names: ReadonlyArray<string>, sceneCount: number): string => {
    const quoted = names.map((name) => `“${name}”`)
    const more = sceneCount - quoted.length
    const held = "Home doesn't try it again as it is."
    if (quoted.length === 0)
      return sceneCount === 1
        ? `One scene is too full for its frame, so the video would cut it off. ${held}`
        : `${String(sceneCount)} scenes are too full for their frame, so the video would cut them off. ${held}`
    if (more <= 0 && quoted.length === 1)
      return `The scene ${quoted.join("")} is too full for its frame, so the video would cut it off. ${held}`
    const named =
      more > 0
        ? `${quoted.join(", ")} and ${String(more)} more`
        : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`
    return `The scenes ${named} are too full for their frame, so the video would cut them off. ${held}`
  },
} as const

function refusalLine(
  feed: string,
  refusal: Refusal,
  names: ReadonlyArray<string>
): string {
  switch (refusal.kind) {
    case "too-long": {
      return REFUSAL_WORDS.tooLong(feed, refusal.minutes, refusal.capMinutes)
    }
    case "too-large": {
      return REFUSAL_WORDS.tooLarge(refusal.mb, refusal.capMb)
    }
    case "overflow": {
      return REFUSAL_WORDS.overflow(names, refusal.sceneCount)
    }
    default: {
      return assertNever(refusal)
    }
  }
}

/**
 * Why home set a cards essay aside before making it (WALK7,
 * paulgsc/server#1052; SNIPS2, server#1076; public pages, server#1144;
 * walks, #3476), by
 * home's word for each: its `essay_media` refusals, a closed set. A take home hasn't finished listening
 * to is no refusal: the essay waits, unseen here, as a Rust Rounds essay
 * waits for its takes. A take the owner deleted is no refusal either: home
 * withdraws the essay for good, its video included, and it leaves every list
 * (paulgsc/server#1055, #1071), so `take-missing` is a take home never had, or
 * one deleted while no account is linked to resolve it (paulgsc/server#1064).
 */
const ESSAY_REFUSAL_WORDS = {
  "take-missing": (n: number): string =>
    `${n > 1 ? `${String(n)} spoken cards in it play recordings` : "A spoken card in it plays a recording"} home doesn't have. Home holds it, and makes it by itself once the essay names ${n > 1 ? "recordings" : "one"} home keeps.`,
  "take-unheard": (n: number): string =>
    `Home couldn't make out ${n === 0 ? "recordings" : n === 1 ? "1 recording" : `${String(n)} recordings`} its spoken cards play, so it holds the essay until it can hear ${n === 1 ? "it" : "them"}.`,
  "snip-missing": (n: number): string =>
    n > 1
      ? `It shows ${String(n)} pictures of the app that home couldn't get. Home holds it, and makes it by itself once the essay names pictures its capture holds and home can fetch.`
      : "It shows a picture of the app that home couldn't get. Home holds it, and makes it by itself once the essay names a picture its capture holds and home can fetch.",
  // C875: home never captures pictures itself; the owner runs it again.
  "snip-gone": (n: number): string =>
    `It shows ${n > 1 ? `${String(n)} pictures` : n === 1 ? "a picture" : "pictures"} of the app that home couldn't get from ${n === 1 ? "its" : "their"} capture. Re-run that Snips Capture, or run one for the commit the essay names, and home makes it then.`,
  "page-missing": (n: number): string =>
    `It shows ${n > 1 ? `${String(n)} pages` : "a page"} from the web that home couldn't get, or that no capture made. Home holds it, and makes it by itself once the essay names ${n > 1 ? "pages" : "a page"} its capture holds and home can fetch.`,
  // #3395: a page is live, so a lost capture is taken again, never re-run;
  // home never captures pages itself.
  "page-gone": (n: number): string =>
    `It shows ${n > 1 ? `${String(n)} pages` : n === 1 ? "a page" : "pages"} from the web that home couldn't get from the capture the essay names: the capture may be over a day old, may have failed, or may not hold ${n === 1 ? "that picture" : "those pictures"} as the essay names ${n === 1 ? "it" : "them"}. Take ${n === 1 ? "the page" : "the pages"} again with Public Pages Capture, and name only the new pictures in the essay.`,
  "walk-missing": (n: number): string =>
    `It plays ${n > 1 ? `${String(n)} walks` : "a walk"} through the app that home couldn't get yet. Home holds it, and makes it by itself once it can fetch ${n > 1 ? "them" : "it"}.`,
  // #3476: home never walks the app itself; the owner runs Snips Capture.
  "walk-gone": (n: number): string =>
    `It plays ${n > 1 ? `${String(n)} walks` : n === 1 ? "a walk" : "walks"} through the app that home couldn't get from the capture the essay names: the capture may be over a day old, may have failed, or may not hold ${n === 1 ? "that walk" : "those walks"} as the essay names ${n === 1 ? "it" : "them"}. Run Snips Capture again, and name the new run's walk in the essay.`,
  "clip-missing": (n: number): string =>
    `It shows ${n > 1 ? `${String(n)} clips` : "a clip"} home doesn't have. Home holds it, and makes it by itself once the essay names ${n > 1 ? "clips" : "one"} home keeps.`,
} as const

type EssayRefusal = keyof typeof ESSAY_REFUSAL_WORDS

const isEssayRefusal = (reason: string): reason is EssayRefusal =>
  Object.hasOwn(ESSAY_REFUSAL_WORDS, reason)

/**
 * Names home gives a refusal's items, when it names every one of them (home
 * names a list whole or not at all); null otherwise.
 */
function namesOf(
  items: ReadonlyArray<string> | undefined,
  names: ReadonlyArray<string> | undefined
): ReadonlyArray<string> | null {
  if (items === undefined || names === undefined) return null
  return names.length === items.length && names.length > 0 ? names : null
}

/** Names as a person reads a list: "“A”", "“A” and “B”", "“A”, “B” and “C”". */
function namesSaid(names: ReadonlyArray<string>): string {
  const quoted = names.map((name) => `“${name}”`)
  return quoted.length <= 1
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`
}

/** What stopped a render, in the person's terms. */
export function failedLine(failed: RenderFailed): string {
  // A preview is made once a person asks, never again on its own.
  if (failed.feed === "preview")
    return (
      PREVIEW_WORDS.failedWhy(failed.reason) ?? PREVIEW_WORDS.standing.failed
    )
  if (
    failed.feed === "cards-essay" &&
    failed.reason !== undefined &&
    isEssayRefusal(failed.reason)
  ) {
    // The takes by the names home gives (`itemNames`), else counted: never
    // by their ids.
    const names = namesOf(failed.items, failed.itemNames)
    if (names !== null && failed.reason === "take-unheard")
      return `Home couldn't make out the ${names.length === 1 ? "take" : "takes"} for ${namesSaid(names)}, so it holds the essay until it can hear ${names.length === 1 ? "it" : "them"}.`
    if (names !== null && failed.reason === "take-missing")
      return `Home doesn't have the ${names.length === 1 ? "take" : "takes"} for ${namesSaid(names)}. Home holds it, and makes it by itself once the essay names ${names.length === 1 ? "one" : "recordings"} home keeps.`
    return ESSAY_REFUSAL_WORDS[failed.reason](failed.items?.length ?? 0)
  }
  const refusal = refusalOf(failed)
  if (refusal !== null)
    return refusalLine(
      failed.feed,
      refusal,
      // Whole or not at all: a name is never said against another scene.
      namesOf(failed.scenes, failed.sceneNames) ?? []
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

/**
 * What an owed video waits on (#3478, #3480), by home's word for it. A take
 * home couldn't hear is the owner's to look at: its line is followed by the
 * way to Needs your attention (`COMING_ATTENTION`).
 */
const WAITS_WORDS = {
  "essay-refused":
    "Home refused the essay before making it, and sent you an alert saying where the reason is.",
  "essay-waiting":
    "The essay came, and waits for a take it plays to reach home.",
  "not-final": "It waits for home to make the week's record final.",
  "take-unheard": "It waits on a take home couldn't hear.",
  "take-hearing": "It waits for home to hear a take.",
  "not-written":
    "Nothing was written for it: the Monday routine didn't write the essay.",
  "week-missing":
    "The week hasn't reached home: the weekly routine wrote none, or home hasn't read it yet.",
} as const satisfies Record<WaitsOn, string>

/** The way from a row that waits on an unheard take to where it is heard. */
export const COMING_ATTENTION = "See Needs your attention."

export type ComingLines = {
  /** The feed's name, then when it was or is expected. */
  readonly line: string
  /** What it waits on, where home says. */
  readonly waits: string | null
  /** Whether the row leads to Needs your attention. */
  readonly toAttention: boolean
}

/**
 * A row under Coming: when it is expected, or that it is late (#3478), and
 * what it waits on, said whenever home says it, on its own day too.
 */
export function comingLines(coming: Coming): ComingLines {
  const when = coming.overdue
    ? `Was expected ${dayOf(coming.on)}. Not here yet.`
    : `Expected ${dayOf(coming.on)}.`
  return {
    line: `${feedName(coming.feed)}. ${when}`,
    waits: coming.waitsOn === undefined ? null : WAITS_WORDS[coming.waitsOn],
    toAttention: coming.waitsOn === "take-unheard",
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
  busy: "This phone was busy with home just then. It asks again in half a minute.",
  busyStale:
    "This phone was busy with home just then. This is what home said last; it asks again in half a minute.",
  open: "See what home is making",
  lineUntilRead: "Home's renders",
} as const

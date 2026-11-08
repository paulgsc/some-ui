/**
 * Feedback on an episode (SFEED6, #2745; FEED5, #2648): a note left at a
 * moment of one of a feed's episodes, with categories picked from the fixed
 * set (SFEED decisions 7 and 10, #2670). Where each category goes is code's,
 * never a choice made on screen (FEED decision 5, #2643):
 *
 * - what it said shapes the feed's next fill (`nextFill`);
 * - a broken slide is a defect (`defect`);
 * - the rest of how it looked or sounded changes the feed's template
 *   (`template`).
 */
import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

import type { Appended } from "@/lib/bounded-list"
import type { Feed } from "@/lib/feeds"
import { FEEDS } from "@/lib/feeds"

/** What it said (decision 7's first group). */
export const SAID = [
  "shallow",
  "technical",
  "missedIntuition",
  "unsupported",
  "tooLong",
  "tooShort",
] as const

/** How it looked or sounded (decision 7's second group). */
export const SHOWN = [
  "textClipped",
  "slideShakes",
  "overlap",
  "hardToRead",
  "pacing",
  "voice",
  "musicLoud",
  "subtitlesOff",
] as const

export const CATEGORIES = [...SAID, ...SHOWN] as const

export type Category = (typeof CATEGORIES)[number]

/** Where a note goes once it is filed, in the order a note lists them. */
const DESTINATIONS = ["nextFill", "template", "defect"] as const

export type Destination = (typeof DESTINATIONS)[number]

/** A slide drawn wrong is broken: the template promised better (#2671). */
const BROKEN: ReadonlySet<Category> = new Set<Category>([
  "textClipped",
  "slideShakes",
  "overlap",
])

const SAID_SET: ReadonlySet<Category> = new Set<Category>(SAID)

export function destinationOf(category: Category): Destination {
  if (SAID_SET.has(category)) return "nextFill"
  return BROKEN.has(category) ? "defect" : "template"
}

/** Every place a note's categories send it, each once, in `DESTINATIONS` order. */
export function destinationsOf(
  categories: ReadonlyArray<Category>
): ReadonlyArray<Destination> {
  const reached = new Set(categories.map(destinationOf))
  return DESTINATIONS.filter((destination) => reached.has(destination))
}

export const NoteSchema = z.object({
  id: z.string().min(1),
  feed: z.enum(FEEDS),
  /** The episode's key, as home lists it. */
  episode: z.string().min(1),
  /** The moment in the episode, from its start. */
  atMs: z.number().int().nonnegative(),
  /** Picked from the fixed set, in its order, each once, at least one. */
  categories: z
    .array(z.enum(CATEGORIES))
    .min(1)
    .refine(
      (picked) =>
        CATEGORIES.filter((c) => picked.includes(c)).join() === picked.join()
    ),
  writtenAt: z.iso.datetime(),
})

/** A kept note. */
export type Note = z.infer<typeof NoteSchema>

/** The note being written on an episode's page. */
export type Draft =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly atMs: number
      readonly picked: ReadonlyArray<Category>
      /** Why the phone couldn't keep it; the categories stay picked. */
      readonly refused: Exclude<Appended, "kept"> | null
    }

export const CLOSED: Draft = { kind: "closed" }

export type DraftEvent =
  /** "Leave a note here", at the moment the video stood at. */
  | { readonly type: "opened"; readonly atMs: number }
  | { readonly type: "toggled"; readonly category: Category }
  | { readonly type: "cancelled" }
  /** What keeping it came to. */
  | { readonly type: "kept"; readonly came: Appended }

/** A moment as whole milliseconds, from a player's seconds. */
export function momentOf(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0
    ? Math.floor(seconds * 1000)
    : 0
}

export function step(draft: Draft, event: DraftEvent): Draft {
  switch (event.type) {
    case "opened": {
      // A note already open keeps its moment and what was picked.
      return draft.kind === "open"
        ? draft
        : { kind: "open", atMs: event.atMs, picked: [], refused: null }
    }
    case "toggled": {
      if (draft.kind === "closed") return draft
      const on = draft.picked.includes(event.category)
      const picked = CATEGORIES.filter((category) =>
        category === event.category ? !on : draft.picked.includes(category)
      )
      return { ...draft, picked, refused: null }
    }
    case "cancelled": {
      return CLOSED
    }
    case "kept": {
      if (draft.kind === "closed") return draft
      return event.came === "kept" ? CLOSED : { ...draft, refused: event.came }
    }
    default: {
      return assertNever(event)
    }
  }
}

/** Whether the draft can be kept: open, with something picked. */
export const keepable = (
  draft: Draft
): draft is Extract<Draft, { kind: "open" }> =>
  draft.kind === "open" && draft.picked.length > 0

/** The note a draft becomes, or null while it can't be kept. */
export function noteOf(
  draft: Draft,
  where: { readonly feed: Feed; readonly episode: string },
  made: { readonly id: string; readonly now: Date }
): Note | null {
  if (!keepable(draft)) return null
  return {
    id: made.id,
    feed: where.feed,
    episode: where.episode,
    atMs: draft.atMs,
    categories: [...draft.picked],
    writtenAt: made.now.toISOString(),
  }
}

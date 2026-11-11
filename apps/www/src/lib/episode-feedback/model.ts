/**
 * Feedback on an episode (SFEED6, #2745; FEED5, #2648): a note left at a
 * moment of one of a feed's episodes, with categories picked from the fixed
 * set (SFEED decisions 7 and 10, #2670). The set, and where each category
 * goes, are `@some-ui/video-render`'s `feedback.ts`, which the routine's
 * filing reads too.
 *
 * A note may carry a spoken part (step 3): a take on the library desk
 * (`lib/library-takes`, ST32), recorded while the note is open and named by
 * its own id, which is its voice note id on home. It is said before the note
 * is kept, never added after.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Category } from "@some-ui/video-render"
import { CATEGORIES } from "@some-ui/video-render"
import type { PatternTake } from "@some-ui/voice-capture"
import { currentTakeOf } from "@some-ui/voice-capture"
import { z } from "zod"

import type { Appended } from "@/lib/bounded-list"
import type { NotedFeed } from "@/lib/feeds"
import { NOTED_FEEDS } from "@/lib/feeds"

export type { Category, Destination } from "@some-ui/video-render"
export { CATEGORIES, destinationsOf, SAID, SHOWN } from "@some-ui/video-render"

export const NoteSchema = z.object({
  id: z.string().min(1),
  feed: z.enum(NOTED_FEEDS),
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
  /** The spoken part: a library take's id (its voice note id on home). */
  take: z.string().min(1).optional(),
})

/** A kept note. */
export type Note = z.infer<typeof NoteSchema>

/** The note being written on an episode's page. */
export type Draft =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      /** The note's id, from the moment it opens. */
      readonly id: string
      readonly atMs: number
      readonly picked: ReadonlyArray<Category>
      /** Why the phone couldn't keep it; the categories stay picked. */
      readonly refused: Exclude<Appended, "kept"> | null
    }

export const CLOSED: Draft = { kind: "closed" }

export type DraftEvent =
  /** "Leave a note here", at the moment the video stood at. */
  | { readonly type: "opened"; readonly id: string; readonly atMs: number }
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
        : {
            kind: "open",
            id: event.id,
            atMs: event.atMs,
            picked: [],
            refused: null,
          }
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

/**
 * What the takes of an open note answer on the library desk: one line per
 * note, so another note's takes, and the library's own, are never its.
 */
export const spokenLine = (id: string): string => `episode-note:${id}`

/**
 * The take a note names: the newest said for it and still its own. One said
 * again before it (D2) stays a library take, kept, and the note names the
 * newer.
 */
export const spokenTakeOf = (
  takes: ReadonlyArray<PatternTake>,
  id: string
): string | null => currentTakeOf(takes, spokenLine(id))?.id ?? null

/**
 * The note a draft becomes, with `take` its spoken part when one was said,
 * or null while it can't be kept.
 */
export function noteOf(
  draft: Draft,
  where: { readonly feed: NotedFeed; readonly episode: string },
  made: { readonly now: Date; readonly take: string | null }
): Note | null {
  if (!keepable(draft)) return null
  return {
    id: draft.id,
    feed: where.feed,
    episode: where.episode,
    atMs: draft.atMs,
    categories: [...draft.picked],
    writtenAt: made.now.toISOString(),
    ...(made.take === null ? {} : { take: made.take }),
  }
}

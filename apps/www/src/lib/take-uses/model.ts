/**
 * What uses each take (INUSE, C1360): the one family of a take's uses,
 * joined from where the phone already keeps each reference to a take. Pure;
 * `./index` reads the stores, `./words` says each use.
 *
 * A use is a pick that something kept makes of one take among its retries:
 * a spoken card's part plays the take it `using` names (`lib/studio-spoken`,
 * SCR3); a Studio video's scene is cut from its `chosen` take; an idea's
 * answer is its last take (ST26); a revision queued for home to make names
 * each scene's take (ST33); an interview week, or a Rust Rounds week,
 * went home naming the take of each answer, read and opening question.
 * A video home holds that plays a take is home's to say (`usedBy` on each
 * note of `GET /voice-notes/kept` and `/voice-notes/takes`, paulgsc/server
 * INUSE-S): the `home` member, as home last said it of that take. A home
 * before it says nothing, and the sheet keeps its line on any essay video
 * that plays it.
 *
 * - **TU1: a take some store uses is never said to be unused.** A source
 *   this phone couldn't read whole is `unread`, never an empty one: a row
 *   then carries the "couldn't check" mark, and the delete sheet says so.
 *   `unseen` reads every use, or source unread, the owner was not shown as
 *   new, and the sheet asks again on it (`lib/my-data/deleting`).
 * - Not a use: an interview or Rust Rounds take not yet sent (nothing picked
 *   it), an interview question's first take (`ladder.first`, kept as the
 *   record of growth, not as a pick), a scene note or reflection said aloud.
 */
import { assertNever } from "@some-ui/core-utils"
import type { WeekSent } from "@some-ui/rust-rounds"
import { z } from "zod"

import type { InterviewSent } from "@/lib/interview-week/spec"
import type { SpokenCard } from "@/lib/studio-spoken/model"

/** Each place that can use a take, in the order the sheet names them. */
export const USE_SOURCES = [
  "spoken",
  "videos",
  "ideas",
  "interview",
  "rust",
] as const

export type UseSource = (typeof USE_SOURCES)[number]

/** One use of a take: what picks it, and as what. */
export type TakeUse =
  /** Part `part` (from 1) of spoken card `card` plays it. */
  | {
      readonly kind: "spoken"
      readonly card: string
      readonly title: string
      readonly part: number
    }
  /**
   * Studio video `video`'s scene `scene` (from 1, in its latest cut; null
   * when the latest cut no longer has the shot) is chosen with it.
   */
  | {
      readonly kind: "scene"
      readonly video: string
      readonly title: string
      readonly shot: string
      readonly scene: number | null
    }
  /**
   * Revision `rev` of Studio video `video`, queued for home to make (ST33),
   * names it as scene `scene`'s take (numbered as `scene` is).
   */
  | {
      readonly kind: "queued"
      readonly video: string
      readonly title: string
      readonly rev: number
      readonly shot: string
      readonly scene: number | null
    }
  /** It is the take now of an answer of idea `idea`. */
  | {
      readonly kind: "idea"
      readonly idea: string
      readonly title: string | null
      readonly question: string
    }
  /** It went home with interview week `week`, as an answer or a read. */
  | {
      readonly kind: "interview"
      readonly week: string
      readonly as: "answer" | "read"
    }
  /**
   * A video home holds plays it, as home last said: a week's essay
   * (`feed-video`), a cards essay (`essay`), a Studio video queued
   * (`studio-video`), or a kind this build doesn't know (`other`).
   * `withdraws`: home withdraws the video once the take is deleted; null
   * when home's word on it couldn't be read.
   */
  | {
      readonly kind: "home"
      readonly video: HomeVideo
      readonly key: string
      readonly title: string
      readonly withdraws: boolean | null
    }
  /** It went home with Rust Rounds week `week`, as an answer or an opening. */
  | {
      readonly kind: "rust"
      readonly week: string
      readonly as: "answer" | "opening"
    }

/** The kinds of video home names in `usedBy`, and one it names that this build doesn't know. */
const HOME_VIDEOS = ["feed-video", "essay", "studio-video"] as const

export type HomeVideo = (typeof HOME_VIDEOS)[number] | "other"

const HomeEntrySchema = z.object({
  kind: z
    .string()
    .transform(
      (kind): HomeVideo => HOME_VIDEOS.find((each) => each === kind) ?? "other"
    ),
  key: z.string(),
  title: z.string(),
  at: z.string(),
  withdrawsOnDelete: z.boolean(),
})

/** One video home names, as this build reads it. */
export type HomeEntry = {
  readonly kind: HomeVideo
  readonly key: string
  readonly title: string
  /** Null for an entry this build couldn't read: a video plays it, no more. */
  readonly withdrawsOnDelete: boolean | null
}

/**
 * What home says uses a take (`usedBy`): unsaid (`undefined`) only when
 * absent, from a home before it. An entry this build can't read, or a
 * value that isn't a list, is still a video that plays it (`other`).
 */
export const UsedBySchema = z
  .unknown()
  .transform((said): ReadonlyArray<HomeEntry> | undefined => {
    if (said === undefined) return undefined
    // Present but not a list: home said something this build can't read,
    // which is a video that may play it, never none (TU1).
    const entries: ReadonlyArray<unknown> = Array.isArray(said) ? said : [null]
    return entries.map((entry, n): HomeEntry => {
      const read = HomeEntrySchema.safeParse(entry)
      return read.success
        ? read.data
        : {
            kind: "other",
            // No key home sends starts with NUL.
            key: `\u0000unread:${String(n)}`,
            title: "",
            withdrawsOnDelete: null,
          }
    })
  })
  .optional()

/** What home said uses each take it listed; `undefined`: it said nothing. */
export type HomeSaid = ReadonlyArray<{
  readonly id: string
  readonly usedBy: z.infer<typeof UsedBySchema>
}>

/** Home's word on a take, as uses. */
export const homeUses = (
  usedBy: ReadonlyArray<HomeEntry>
): ReadonlyArray<TakeUse> =>
  usedBy.map(({ kind, key, title, withdrawsOnDelete }) => ({
    kind: "home",
    video: kind,
    key,
    title,
    withdraws: withdrawsOnDelete,
  }))

/** `uses` with home's word on each take added. */
export function withHome(
  uses: TakeUses,
  home: ReadonlyMap<string, ReadonlyArray<TakeUse>>
): TakeUses {
  if (home.size === 0) return uses
  const of = new Map(uses.of)
  for (const [take, said] of home) {
    if (said.length > 0) of.set(take, [...(of.get(take) ?? []), ...said])
  }
  return { ...uses, of }
}

/** A source as this phone read it: what it holds, or that it couldn't. */
export type Read<T> =
  | {
      readonly kind: "read"
      readonly value: T
      /**
       * The text of each record of it this phone set aside as unreadable
       * (core-utils' `openKept`): a take it names may be used by it.
       */
      readonly setAside?: ReadonlyArray<string> | undefined
    }
  | { readonly kind: "unread" }

/** A Studio video, as its store keeps it (`@some-ui/soundbites`' `Project`). */
export type UseVideo = {
  readonly id: string
  readonly revisions: ReadonlyArray<{
    readonly rev?: number | undefined
    readonly cutList: {
      readonly title: string
      readonly shots: ReadonlyArray<{ readonly id: string }>
    }
  }>
  readonly chosen: Readonly<Record<string, string>>
  /** Each revision queued for home to make, with the take of each scene. */
  readonly queued?:
    | ReadonlyArray<{
        readonly rev: number
        readonly takes: ReadonlyArray<{
          readonly scene: string
          readonly note: string
        }>
      }>
    | undefined
}

/** An idea, as its store keeps it (`@some-ui/soundbites`' `Idea`). */
export type UseIdea = {
  readonly id: string
  readonly about?: { readonly title: string } | undefined
  readonly answers: ReadonlyArray<{
    readonly question: string
    readonly takes?: ReadonlyArray<{ readonly take: string }> | undefined
  }>
}

/** Every source, as read once. */
export type UseSources = {
  readonly spoken: Read<ReadonlyArray<SpokenCard>>
  readonly videos: Read<ReadonlyArray<UseVideo>>
  readonly ideas: Read<ReadonlyArray<UseIdea>>
  readonly interview: Read<ReadonlyArray<InterviewSent>>
  readonly rust: Read<ReadonlyArray<WeekSent>>
}

/**
 * What uses each take, by its id; the sources that couldn't be read at all;
 * and, of those read, the text of each record set aside as unreadable, which
 * leaves in doubt only the takes it names (`unreadOf`): for as long as the
 * copy is kept, which is for good, since nothing on this phone deletes it.
 */
export type TakeUses = {
  readonly of: ReadonlyMap<string, ReadonlyArray<TakeUse>>
  readonly unread: ReadonlyArray<UseSource>
  readonly doubts: ReadonlyArray<{
    readonly source: UseSource
    readonly raw: string
  }>
}

/** No take used, nothing unread: what no read at all must never be taken for. */
export const NO_USES: TakeUses = { of: new Map(), unread: [], doubts: [] }

/** Every source unread: what a read that failed says. */
export const ALL_UNREAD: TakeUses = {
  of: new Map(),
  unread: USE_SOURCES,
  doubts: [],
}

/**
 * The sources that can't say whether they use any of `ids`: those unread,
 * and those holding a record set aside that names one of them.
 */
export function unreadOf(
  uses: TakeUses,
  ids: ReadonlyArray<string>
): ReadonlyArray<UseSource> {
  return USE_SOURCES.filter(
    (source) =>
      uses.unread.includes(source) ||
      uses.doubts.some(
        (doubt) =>
          doubt.source === source &&
          ids.some(
            (id) =>
              doubt.raw.includes(id) ||
              doubt.raw.includes(JSON.stringify(id).slice(1, -1))
          )
      )
  )
}

/** The uses `sources` name, by take. */
export function usesOf(sources: UseSources): TakeUses {
  const of = new Map<string, Array<TakeUse>>()
  const add = (take: string, use: TakeUse): void => {
    const now = of.get(take) ?? []
    if (!now.some((each) => keyOf(each) === keyOf(use))) now.push(use)
    of.set(take, now)
  }
  const unread: Array<UseSource> = USE_SOURCES.filter(
    (source) => sources[source].kind === "unread"
  )
  const doubts = USE_SOURCES.flatMap((source) => {
    const read = sources[source]
    return read.kind === "read"
      ? (read.setAside ?? []).map((raw) => ({ source, raw }))
      : []
  })
  /**
   * Each source's uses; the source is unread too when what it holds isn't
   * the shape its type says (a record from another build), keeping the uses
   * read before the throw: never a throw, and never none (TU1).
   */
  const each = (source: UseSource, step: () => void): void => {
    try {
      step()
    } catch {
      if (!unread.includes(source)) unread.push(source)
    }
  }
  const { spoken, videos, ideas, interview, rust } = sources
  if (spoken.kind === "read")
    each("spoken", () => {
      for (const card of spoken.value) {
        card.parts.forEach((part, n) => {
          if (part.using !== null)
            add(part.using, {
              kind: "spoken",
              card: card.id,
              title: card.title,
              part: n + 1,
            })
        })
      }
    })
  if (videos.kind === "read")
    each("videos", () => {
      for (const video of videos.value) {
        const cut = video.revisions.at(-1)?.cutList
        const scenes = (cut?.shots ?? []).map(({ id }) => id)
        const sceneOf = (shot: string): number | null => {
          const at = scenes.indexOf(shot)
          return at === -1 ? null : at + 1
        }
        const title = cut?.title ?? ""
        for (const [shot, take] of Object.entries(video.chosen)) {
          add(take, {
            kind: "scene",
            video: video.id,
            title,
            shot,
            scene: sceneOf(shot),
          })
        }
        for (const { rev, takes } of video.queued ?? []) {
          // Numbered as that revision's own cut has its scenes.
          const own = video.revisions.find((each) => each.rev === rev)?.cutList
          const shots = (own?.shots ?? []).map(({ id }) => id)
          for (const { scene: shot, note } of takes) {
            const at = shots.indexOf(shot)
            add(note, {
              kind: "queued",
              video: video.id,
              title: own?.title ?? title,
              rev,
              shot,
              scene: at === -1 ? null : at + 1,
            })
          }
        }
      }
    })
  if (ideas.kind === "read")
    each("ideas", () => {
      for (const idea of ideas.value) {
        for (const answer of idea.answers) {
          const now = answer.takes?.at(-1)
          if (now !== undefined)
            add(now.take, {
              kind: "idea",
              idea: idea.id,
              title: idea.about?.title ?? null,
              question: answer.question,
            })
        }
      }
    })
  if (interview.kind === "read")
    each("interview", () => {
      for (const sent of interview.value) {
        for (const { take } of sent.answers)
          add(take, { kind: "interview", week: sent.week, as: "answer" })
        for (const { take } of sent.reads)
          add(take, { kind: "interview", week: sent.week, as: "read" })
      }
    })
  if (rust.kind === "read")
    each("rust", () => {
      for (const sent of rust.value) {
        for (const { take } of sent.answers)
          add(take, { kind: "rust", week: sent.week, as: "answer" })
        for (const { take } of sent.opening ?? [])
          add(take, { kind: "rust", week: sent.week, as: "opening" })
      }
    })
  return {
    of,
    unread: USE_SOURCES.filter((source) => unread.includes(source)),
    doubts,
  }
}

/** What uses take `id`, as `uses` read it. */
export const usesOfTake = (
  uses: TakeUses,
  id: string
): ReadonlyArray<TakeUse> => uses.of.get(id) ?? []

/** A use's identity, to tell one seen from one new. */
function keyOf(use: TakeUse): string {
  switch (use.kind) {
    case "spoken": {
      return `spoken:${use.card}:${String(use.part)}`
    }
    case "scene": {
      return `scene:${use.video}:${use.shot}`
    }
    case "queued": {
      return `queued:${use.video}:${String(use.rev)}:${use.shot}`
    }
    case "idea": {
      return `idea:${use.idea}:${use.question}`
    }
    case "home": {
      return `home:${use.video}:${use.key}`
    }
    case "interview":
    case "rust": {
      return `${use.kind}:${use.week}:${use.as}`
    }
    default: {
      return assertNever(use)
    }
  }
}

/**
 * Whether `fresh` says of `ids` anything the owner was not shown in `shown`
 * (null: nothing shown yet): a use of one of them not among those shown, or
 * a source now unread that read before (TU1). A use that went since is not
 * new: deleting then takes less than the owner agreed to.
 */
export function unseen(
  shown: TakeUses | null,
  fresh: TakeUses,
  ids: ReadonlyArray<string>
): boolean {
  const before = shown ?? NO_USES
  const was = unreadOf(before, ids)
  const newlyUnread = unreadOf(fresh, ids).some(
    (source) => shown === null || !was.includes(source)
  )
  if (newlyUnread) return true
  return newUse(before, fresh, ids)
}

/** Whether `fresh` holds a use of `ids` that `shown` didn't. */
export function newUse(
  shown: TakeUses,
  fresh: TakeUses,
  ids: ReadonlyArray<string>
): boolean {
  return ids.some((id) => {
    const seen = new Set(usesOfTake(shown, id).map(keyOf))
    return usesOfTake(fresh, id).some((use) => !seen.has(keyOf(use)))
  })
}

/**
 * How many things `uses` are of: a card used for two parts, or a video
 * whose scene and queued version both have the take, is one.
 */
export function thingsIn(uses: ReadonlyArray<TakeUse>): number {
  const thing = (use: TakeUse): string => {
    switch (use.kind) {
      case "spoken": {
        return `card:${use.card}`
      }
      case "scene":
      case "queued": {
        return `video:${use.video}`
      }
      case "idea": {
        return `idea:${use.idea}`
      }
      case "home": {
        // A queued Studio video home names by the video's own id.
        return use.video === "studio-video"
          ? `video:${use.key}`
          : `home:${use.video}:${use.key}`
      }
      case "interview":
      case "rust": {
        return `${use.kind}:${use.week}`
      }
      default: {
        return assertNever(use)
      }
    }
  }
  return new Set(uses.map(thing)).size
}

/** The uses of `ids`, each with its take, in `ids`' order. */
export const usesAmong = (
  uses: TakeUses,
  ids: ReadonlyArray<string>
): ReadonlyArray<{ readonly take: string; readonly use: TakeUse }> =>
  ids.flatMap((take) => usesOfTake(uses, take).map((use) => ({ take, use })))

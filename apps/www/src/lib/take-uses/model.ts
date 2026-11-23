/**
 * What uses each take (INUSE, C1360): the one family of a take's uses,
 * joined from where the phone already keeps each reference to a take. Pure;
 * `./index` reads the stores, `./words` says each use.
 *
 * A use is a pick that something kept makes of one take among its retries:
 * a spoken card's part plays the take it `using` names (`lib/studio-spoken`,
 * SCR3); a Studio video's scene is cut from its `chosen` take; an idea's
 * answer is its last take (ST26); an interview week, or a Rust Rounds week,
 * went home naming the take of each answer, read and opening question.
 * A video home made that plays a take is home's to say, and no list home
 * gives says it yet: its member waits on home.
 *
 * - **TU1: a take some store uses is never shown as unused.** A source this
 *   phone couldn't read is `unread`, never an empty one, and `unseen` reads
 *   every use, or source unread, the owner was not shown as new.
 */
import { assertNever } from "@some-ui/core-utils"
import type { WeekSent } from "@some-ui/rust-rounds"

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
  /** It went home with Rust Rounds week `week`, as an answer or an opening. */
  | {
      readonly kind: "rust"
      readonly week: string
      readonly as: "answer" | "opening"
    }

/** A source as this phone read it: what it holds, or that it couldn't. */
export type Read<T> =
  | { readonly kind: "read"; readonly value: T }
  | { readonly kind: "unread" }

/** A Studio video, as its store keeps it (`@some-ui/soundbites`' `Project`). */
export type UseVideo = {
  readonly id: string
  readonly revisions: ReadonlyArray<{
    readonly cutList: {
      readonly title: string
      readonly shots: ReadonlyArray<{ readonly id: string }>
    }
  }>
  readonly chosen: Readonly<Record<string, string>>
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

/** What uses each take, by its id, and the sources that couldn't be read. */
export type TakeUses = {
  readonly of: ReadonlyMap<string, ReadonlyArray<TakeUse>>
  readonly unread: ReadonlyArray<UseSource>
}

/** No take used, nothing unread: what no read at all must never be taken for. */
export const NO_USES: TakeUses = { of: new Map(), unread: [] }

/** The uses `sources` name, by take. */
export function usesOf(sources: UseSources): TakeUses {
  const of = new Map<string, Array<TakeUse>>()
  const add = (take: string, use: TakeUse): void => {
    const now = of.get(take) ?? []
    if (!now.some((each) => keyOf(each) === keyOf(use))) now.push(use)
    of.set(take, now)
  }
  const unread = USE_SOURCES.filter(
    (source) => sources[source].kind === "unread"
  )
  const { spoken, videos, ideas, interview, rust } = sources
  if (spoken.kind === "read") {
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
  }
  if (videos.kind === "read") {
    for (const video of videos.value) {
      const cut = video.revisions.at(-1)?.cutList
      const scenes = (cut?.shots ?? []).map(({ id }) => id)
      for (const [shot, take] of Object.entries(video.chosen)) {
        const at = scenes.indexOf(shot)
        add(take, {
          kind: "scene",
          video: video.id,
          title: cut?.title ?? "",
          scene: at === -1 ? null : at + 1,
        })
      }
    }
  }
  if (ideas.kind === "read") {
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
  }
  if (interview.kind === "read") {
    for (const sent of interview.value) {
      for (const { take } of sent.answers)
        add(take, { kind: "interview", week: sent.week, as: "answer" })
      for (const { take } of sent.reads)
        add(take, { kind: "interview", week: sent.week, as: "read" })
    }
  }
  if (rust.kind === "read") {
    for (const sent of rust.value) {
      for (const { take } of sent.answers)
        add(take, { kind: "rust", week: sent.week, as: "answer" })
      for (const { take } of sent.opening ?? [])
        add(take, { kind: "rust", week: sent.week, as: "opening" })
    }
  }
  return { of, unread }
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
      return `scene:${use.video}:${String(use.scene)}`
    }
    case "idea": {
      return `idea:${use.idea}:${use.question}`
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
  const newlyUnread = fresh.unread.some(
    (source) => shown === null || !before.unread.includes(source)
  )
  if (newlyUnread) return true
  return ids.some((id) => {
    const seen = new Set(usesOfTake(before, id).map(keyOf))
    return usesOfTake(fresh, id).some((use) => !seen.has(keyOf(use)))
  })
}

/** The uses of `ids`, each with its take, in `ids`' order. */
export const usesAmong = (
  uses: TakeUses,
  ids: ReadonlyArray<string>
): ReadonlyArray<{ readonly take: string; readonly use: TakeUse }> =>
  ids.flatMap((take) => usesOfTake(uses, take).map((use) => ({ take, use })))

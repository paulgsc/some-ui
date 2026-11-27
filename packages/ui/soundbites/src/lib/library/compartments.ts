/**
 * Takes in compartments (TAKES2 #3068, TAKES3 #3069; epic #3029): what each
 * take was said for, and which takes a compartment and a chip hold. Pure;
 * the words are `./words`', the screen is `components/take-library`.
 *
 * - **Every take has one kind.** What the build knows of it
 *   (`LibraryAbout`, from the stores the phone keeps) says it first; else
 *   its ref does (`aboutOfRef`). A note's spoken take goes home as a plain
 *   take (`take:<id>`), so only the note store can say it is a note's.
 * - **A chip counts what it would show.** Each count is of the takes in the
 *   compartment with the other group's chip applied, so tapping a chip
 *   shows as many of the takes read as it said. Home keeps more than one
 *   page can hold: past the first, a tap that asks home (a kind, a topic)
 *   can show more, and the page says the counts are of those read so far.
 */

import { assertNever } from "@some-ui/core-utils"
import { parseAskId, spokenPartOfLine } from "@some-ui/video-render"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

import type { PortAbout, PortKind, TakeOf, TakeTopic } from "./kinds"
import { KIND_OF, TAKE_OFS } from "./kinds"
import { LIBRARY_WORDS } from "./words"

/** Studio's own kinds of take, split by what each was said for. */
export const STUDIO_KINDS = [
  "note",
  "scene",
  "idea",
  "ask",
  "spoken",
  "here",
] as const

/**
 * What a take was said for, in the order Takes shows the kinds: Studio's
 * own, then every other kind home keeps (`./kinds`), then one this
 * phone doesn't know yet, whose tile shows only while it holds any.
 */
export const TAKE_KINDS = [
  ...STUDIO_KINDS,
  "bite",
  "round",
  "interview",
  "reflection",
  "jobs",
  "drama",
  "soundbite",
  "lens",
  "leetype",
  "hunch",
  "other",
] as const satisfies ReadonlyArray<(typeof STUDIO_KINDS)[number] | PortKind>

export type TakeKind = (typeof TAKE_KINDS)[number]

/** A compartment of Takes: one kind, or all of them. */
export type Compartment = TakeKind | "all"

export const COMPARTMENTS: ReadonlyArray<Compartment> = [...TAKE_KINDS, "all"]

export const isCompartment = (value: unknown): value is Compartment =>
  COMPARTMENTS.some((compartment) => compartment === value)

/**
 * What a take was said for, as far as the phone knows it. Each name is
 * already in the person's words (a feed's name, a pick's words); null where
 * the phone holds nothing to name it by.
 */
export type TakeAbout =
  | {
      readonly kind: "note"
      /** The feed's name and the episode's, as Studio says them. */
      readonly feed: string
      readonly episode: string
      /** The moment the note was left at, from the episode's start. */
      readonly atMs: number
      readonly picks: ReadonlyArray<string>
    }
  | {
      readonly kind: "scene"
      /** The video's title. */
      readonly video: string | null
      /** The scene's place in the video, from 1. */
      readonly scene: number | null
    }
  | {
      readonly kind: "idea"
      /** The idea's title. */
      readonly idea: string | null
      /** The question the take answers. */
      readonly question: string | null
    }
  | {
      readonly kind: "ask"
      /** The ask's question, or its title. */
      readonly ask: string | null
      /** Its issue's number. */
      readonly number: number | null
    }
  | {
      readonly kind: "spoken"
      /** The spoken card, by its id, and its title where the phone keeps it. */
      readonly card: string
      readonly title: string | null
      /** The part it is a take of, from 0. */
      readonly part: number
    }
  | { readonly kind: "here" }
  /** Every other kind, through its port (`./kinds`). */
  | PortAbout

/**
 * What a take is about that others of its kind may share: a
 * note's episode, a scene's video, an idea, an ask, a bite's game, a week;
 * null for one about nothing more than its kind.
 */
export function topicOf(about: TakeAbout): TakeTopic | null {
  if ("parts" in about) return about.topic
  switch (about.kind) {
    case "note": {
      const label = `${about.feed} · ${about.episode}`
      return { key: label, label }
    }
    case "scene": {
      return about.video === null
        ? null
        : { key: about.video, label: about.video }
    }
    case "idea": {
      return about.idea === null ? null : { key: about.idea, label: about.idea }
    }
    case "ask": {
      return about.ask === null ? null : { key: about.ask, label: about.ask }
    }
    case "spoken": {
      return {
        key: `spoken:${about.card}`,
        label: about.title ?? LIBRARY_WORDS.aSpokenCard,
      }
    }
    case "here": {
      return null
    }
    default: {
      return assertNever(about)
    }
  }
}

/**
 * What a take's ref alone says it was for: an idea's answer
 * (`idea:<idea>:<question>`), an ask's (`ask:<repo>-<number>`), a spoken
 * card's part (`spoken:<card>.<part>`, #3339), a video's scene
 * (`<video>:<scene>:<take>`), else a take recorded on Takes.
 */
export function aboutOfRef(ref: string): TakeAbout {
  const spoken = spokenPartOfLine(ref)
  if (spoken !== null) {
    return { kind: "spoken", card: spoken.card, title: null, part: spoken.part }
  }
  if (ref.startsWith("idea:")) {
    const question = ref.split(":")[2] ?? ""
    const questions: Readonly<Record<string, { readonly ask: string }>> =
      STUDIO_WORDS.idea.questions
    return {
      kind: "idea",
      idea: null,
      question: questions[question]?.ask ?? null,
    }
  }
  if (ref.startsWith("ask:")) {
    return {
      kind: "ask",
      ask: null,
      number: parseAskId(ref.slice("ask:".length))?.number ?? null,
    }
  }
  if (ref.split(":").length === 3) {
    return { kind: "scene", video: null, scene: null }
  }
  return { kind: "here" }
}

/**
 * What a take was said for: what the build knows (`known`) over what its
 * ref says (`base`), field by field, where both say the same kind.
 */
export function aboutBoth(base: TakeAbout, known: TakeAbout | null): TakeAbout {
  if (known === null) return base
  if (known.kind === "scene" && base.kind === "scene") {
    return {
      kind: "scene",
      video: known.video ?? base.video,
      scene: known.scene ?? base.scene,
    }
  }
  if (known.kind === "idea" && base.kind === "idea") {
    return {
      kind: "idea",
      idea: known.idea ?? base.idea,
      question: known.question ?? base.question,
    }
  }
  if (known.kind === "spoken" && base.kind === "spoken") {
    return { ...base, title: known.title ?? base.title }
  }
  if (known.kind === "ask" && base.kind === "ask") {
    return {
      kind: "ask",
      ask: known.ask ?? base.ask,
      number: known.number ?? base.number,
    }
  }
  return known
}

/** Where a take is: on this phone only, or on home. */
export type TakePlace = "phone" | "home"

const TAKE_PLACES: ReadonlyArray<TakePlace> = ["phone", "home"]

/**
 * How a take stands: home heard words in it, it waits to be heard
 * (on this phone, or on home not heard yet), home heard no words in it, it
 * was set aside, its recording was let go (the record stays), or it was
 * deleted for good, with a receipt.
 */
const TAKE_STATUSES = [
  "heard",
  "waiting",
  "silent",
  "aside",
  "let-go",
  "deleted",
] as const

export type TakeStatus = (typeof TAKE_STATUSES)[number]

/** One take as the compartments sort it. */
export type Sorted = {
  readonly kind: TakeKind
  readonly place: TakePlace
  /** Its station's name on the conveyor; null on none. */
  readonly station: string | null
  /** What it is about that others of its kind share; null for nothing. */
  readonly topic?: TakeTopic | null | undefined
  /** How it stands; absent while the phone can't tell (home holds it, unread). */
  readonly status?: TakeStatus | undefined
}

/** The chips picked: none in a group shows all of it. */
export type Chips = {
  readonly place: TakePlace | null
  readonly station: string | null
  /** A kind, picked in All. */
  readonly kind?: TakeKind | null | undefined
  /** A topic: a game, a week. */
  readonly topic?: TakeTopic | null | undefined
  readonly status?: TakeStatus | null | undefined
}

export const NO_CHIPS: Chips = {
  place: null,
  station: null,
  kind: null,
  topic: null,
  status: null,
}

/** Whether any chip is picked. */
export const anyPicked = (chips: Chips): boolean =>
  chips.place !== null ||
  chips.station !== null ||
  (chips.kind ?? null) !== null ||
  (chips.topic ?? null) !== null ||
  (chips.status ?? null) !== null

/** Whether `take` is in `compartment`. */
export const inCompartment = (
  take: Pick<Sorted, "kind">,
  compartment: Compartment
): boolean => compartment === "all" || take.kind === compartment

/** Whether `take` shows under `chips`. */
export const underChips = (take: Sorted, chips: Chips): boolean =>
  (chips.place === null || take.place === chips.place) &&
  (chips.station === null || take.station === chips.station) &&
  ((chips.kind ?? null) === null || take.kind === chips.kind) &&
  ((chips.topic ?? null) === null || take.topic?.key === chips.topic?.key) &&
  ((chips.status ?? null) === null || take.status === chips.status)

/** How many takes each compartment holds. */
export function compartmentCounts(
  takes: ReadonlyArray<Pick<Sorted, "kind">>
): Readonly<Record<Compartment, number>> {
  const counts: Record<Compartment, number> = {
    note: 0,
    scene: 0,
    idea: 0,
    ask: 0,
    spoken: 0,
    here: 0,
    bite: 0,
    round: 0,
    interview: 0,
    reflection: 0,
    jobs: 0,
    drama: 0,
    soundbite: 0,
    lens: 0,
    hunch: 0,
    leetype: 0,
    other: 0,
    all: takes.length,
  }
  for (const take of takes) counts[take.kind] += 1
  return counts
}

/** A chip and how many takes tapping it shows. */
type ChipCount<T> = { readonly chip: T; readonly count: number }

/** A group of chips, and the label of each topic. */
export type ChipGroups = {
  readonly places: ReadonlyArray<ChipCount<TakePlace>>
  readonly stations: ReadonlyArray<ChipCount<string>>
  readonly kinds: ReadonlyArray<ChipCount<TakeKind>>
  readonly topics: ReadonlyArray<ChipCount<TakeTopic>>
  readonly statuses: ReadonlyArray<ChipCount<TakeStatus>>
}

/**
 * The chips of `compartment`'s takes, each with its count: each place, each
 * station in `stations`' order, each kind (in All), each topic (first seen
 * first) and each status, every count under the other groups' chips. A chip
 * that would show nothing is left out, unless it is picked.
 */
export function chipCounts(
  takes: ReadonlyArray<Sorted>,
  compartment: Compartment,
  chips: Chips,
  stations: ReadonlyArray<string>
): ChipGroups {
  const here = takes.filter((take) => inCompartment(take, compartment))
  const count = <T>(
    chip: T,
    picked: boolean,
    shows: (take: Sorted) => boolean
  ): ReadonlyArray<ChipCount<T>> => {
    const n = here.filter(shows).length
    return n > 0 || picked ? [{ chip, count: n }] : []
  }
  const topics = new Map<string, TakeTopic>()
  // A topic picked stays, to be let go, though no take read has it.
  if (chips.topic != null) topics.set(chips.topic.key, chips.topic)
  for (const take of here) {
    if (take.topic != null && !topics.has(take.topic.key)) {
      topics.set(take.topic.key, take.topic)
    }
  }
  return {
    places: TAKE_PLACES.flatMap((place) =>
      count(
        place,
        chips.place === place,
        (take) => take.place === place && underChips(take, { ...chips, place })
      )
    ),
    stations: stations.flatMap((station) =>
      count(
        station,
        chips.station === station,
        (take) =>
          take.station === station && underChips(take, { ...chips, station })
      )
    ),
    kinds:
      compartment === "all"
        ? TAKE_KINDS.flatMap((kind) =>
            count(
              kind,
              chips.kind === kind,
              (take) =>
                take.kind === kind && underChips(take, { ...chips, kind })
            )
          )
        : [],
    topics: [...topics.values()].flatMap((topic) =>
      count(
        topic,
        chips.topic?.key === topic.key,
        (take) =>
          take.topic?.key === topic.key && underChips(take, { ...chips, topic })
      )
    ),
    statuses: TAKE_STATUSES.flatMap((status) =>
      count(
        status,
        chips.status === status,
        (take) =>
          take.status === status && underChips(take, { ...chips, status })
      )
    ),
  }
}

/** A chip of one group. */
export type ChipPick =
  | { readonly group: "place"; readonly value: TakePlace }
  | { readonly group: "station"; readonly value: string }
  | { readonly group: "kind"; readonly value: TakeKind }
  | { readonly group: "topic"; readonly value: TakeTopic }
  | { readonly group: "status"; readonly value: TakeStatus }

/** Picks `chip` in its group, or lets it go when it was picked. */
export function toggled(chips: Chips, chip: ChipPick): Chips {
  if (chip.group === "topic") {
    const picked = chips.topic?.key === chip.value.key
    return { ...chips, topic: picked ? null : chip.value }
  }
  const now = chips[chip.group] ?? null
  return { ...chips, [chip.group]: now === chip.value ? null : chip.value }
}

/**
 * The kinds home is asked for, for a compartment and the kind picked in
 * All: Studio's six are all home's `studio`; each other is its
 * own; All, and a kind this phone doesn't know, ask for every kind.
 */
export function kindsAsked(
  compartment: Compartment,
  picked: TakeKind | null
): ReadonlyArray<TakeOf> | null {
  const kind = compartment === "all" ? picked : compartment
  if (kind === null || kind === "other") return null
  if (STUDIO_KINDS.some((studio) => studio === kind)) return ["studio"]
  const of = TAKE_OFS.find(
    (each) => each !== "studio" && KIND_OF[each] === kind
  )
  return of === undefined ? null : [of]
}

/** How a list of takes is ordered. */
export const ORDERS = ["newest", "oldest", "topic"] as const

export type Order = (typeof ORDERS)[number]

/**
 * `rows` in `order`: by when each was said, newest or oldest first, or by
 * what each is about (its topic's label, those about nothing last), newest
 * first within one.
 */
export function ordered<
  T extends { readonly topic?: TakeTopic | null | undefined },
>(
  rows: ReadonlyArray<T>,
  order: Order,
  at: (row: T) => string
): ReadonlyArray<T> {
  const newest = (a: T, b: T): number => at(b).localeCompare(at(a))
  switch (order) {
    case "newest": {
      return [...rows].sort(newest)
    }
    case "oldest": {
      return [...rows].sort((a, b) => newest(b, a))
    }
    case "topic": {
      return [...rows].sort((a, b) => {
        const x = a.topic?.label ?? null
        const y = b.topic?.label ?? null
        if (x !== y) {
          if (x === null) return 1
          if (y === null) return -1
          return x.localeCompare(y)
        }
        return newest(a, b)
      })
    }
    default: {
      return assertNever(order)
    }
  }
}

/** One row of a list with what its topic holds with no take among it. */
export type WithGap<R, G> =
  | { readonly kind: "take"; readonly row: R }
  | { readonly kind: "gap"; readonly gap: G }

/**
 * `rows`, already in `order`, with `gaps` among them by when each was:
 * what a topic holds that no take is about (a game's moments with no bite,
 * a week's questions not answered), placed newest or oldest first as the
 * rows are. By a topic, the rows share one, so it is newest first.
 * `complete` says whether the rows are every take there is to list. Until
 * it is, no gap shows: a take may be said before or after what it is about
 * (a bite said as the play is offered, before the snap), so the take of any
 * gap may be among those home hasn't shown yet. A gap at the same moment as
 * a row comes after it.
 */
export function withGaps<R, G extends { readonly at: string }>(
  rows: ReadonlyArray<R>,
  gaps: ReadonlyArray<G>,
  order: Order,
  at: (row: R) => string,
  complete: boolean
): ReadonlyArray<WithGap<R, G>> {
  if (!complete) {
    return rows.map((row) => ({ kind: "take", row }))
  }
  // Whether `a` comes before `b` in the list's order, by the instant each
  // names (home's and the phone's times differ in their fractions).
  const before = (a: string, b: string): boolean =>
    order === "oldest"
      ? Date.parse(a) < Date.parse(b)
      : Date.parse(a) > Date.parse(b)
  const sorted = [...gaps].sort((a, b) =>
    before(a.at, b.at) ? -1 : before(b.at, a.at) ? 1 : 0
  )
  const listed: Array<WithGap<R, G>> = []
  let next = 0
  for (const row of rows) {
    for (
      let gap = sorted.at(next);
      gap !== undefined && before(gap.at, at(row));
      gap = sorted.at(next)
    ) {
      listed.push({ kind: "gap", gap })
      next += 1
    }
    listed.push({ kind: "take", row })
  }
  for (const gap of sorted.slice(next)) listed.push({ kind: "gap", gap })
  return listed
}

/**
 * Whether a take's words hold every word of `q`, in lowercase: what home
 * heard and what it is about. Blank `q` holds for every take.
 */
export function holdsWords(words: ReadonlyArray<string>, q: string): boolean {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "")
  const text = words.join(" ").toLowerCase()
  return terms.every((term) => text.includes(term))
}

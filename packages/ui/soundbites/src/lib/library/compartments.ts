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
 *   shows exactly as many takes as it said.
 */

import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

/** What a take was said for, in the order Takes shows the kinds. */
export const TAKE_KINDS = ["note", "scene", "idea", "ask", "here"] as const

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
  | { readonly kind: "here" }

/**
 * What a take's ref alone says it was for: an idea's answer
 * (`idea:<idea>:<question>`), an ask's (`ask:<repo>-<number>`), a video's
 * scene (`<video>:<scene>:<take>`), else a take recorded on Takes.
 */
export function aboutOfRef(ref: string): TakeAbout {
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
    const number = /-([1-9]\d*)$/.exec(ref)?.[1]
    return {
      kind: "ask",
      ask: null,
      number: number === undefined ? null : Number(number),
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

/** One take as the compartments sort it. */
export type Sorted = {
  readonly kind: TakeKind
  readonly place: TakePlace
  /** Its station's name on the conveyor; null on none. */
  readonly station: string | null
}

/** The chips picked: none in a group shows all of it. */
export type Chips = {
  readonly place: TakePlace | null
  readonly station: string | null
}

export const NO_CHIPS: Chips = { place: null, station: null }

/** Whether `take` is in `compartment`. */
export const inCompartment = (
  take: Pick<Sorted, "kind">,
  compartment: Compartment
): boolean => compartment === "all" || take.kind === compartment

/** Whether `take` shows under `chips`. */
export const underChips = (
  take: Pick<Sorted, "place" | "station">,
  chips: Chips
): boolean =>
  (chips.place === null || take.place === chips.place) &&
  (chips.station === null || take.station === chips.station)

/** How many takes each compartment holds. */
export function compartmentCounts(
  takes: ReadonlyArray<Pick<Sorted, "kind">>
): Readonly<Record<Compartment, number>> {
  const counts: Record<Compartment, number> = {
    note: 0,
    scene: 0,
    idea: 0,
    ask: 0,
    here: 0,
    all: takes.length,
  }
  for (const take of takes) counts[take.kind] += 1
  return counts
}

/** A chip and how many takes tapping it shows. */
export type ChipCount<T> = { readonly chip: T; readonly count: number }

/**
 * The chips of `compartment`'s takes, each with its count: each place, and
 * each station in `stations`' order, every count under the other group's
 * chip. A chip that would show nothing is left out, unless it is picked.
 */
export function chipCounts(
  takes: ReadonlyArray<Sorted>,
  compartment: Compartment,
  chips: Chips,
  stations: ReadonlyArray<string>
): {
  readonly places: ReadonlyArray<ChipCount<TakePlace>>
  readonly stations: ReadonlyArray<ChipCount<string>>
} {
  const here = takes.filter((take) => inCompartment(take, compartment))
  const count = <T>(
    chip: T,
    picked: T | null,
    shows: (take: Sorted) => boolean
  ): ReadonlyArray<ChipCount<T>> => {
    const n = here.filter(shows).length
    return n > 0 || picked === chip ? [{ chip, count: n }] : []
  }
  return {
    places: TAKE_PLACES.flatMap((place) =>
      count(
        place,
        chips.place,
        (take) => take.place === place && underChips(take, { ...chips, place })
      )
    ),
    stations: stations.flatMap((station) =>
      count(
        station,
        chips.station,
        (take) =>
          take.station === station && underChips(take, { ...chips, station })
      )
    ),
  }
}

/** Picks `chip` in its group, or lets it go when it was picked. */
export function toggled(
  chips: Chips,
  chip:
    | { readonly group: "place"; readonly value: TakePlace }
    | { readonly group: "station"; readonly value: string }
): Chips {
  if (chip.group === "place") {
    return { ...chips, place: chips.place === chip.value ? null : chip.value }
  }
  return {
    ...chips,
    station: chips.station === chip.value ? null : chip.value,
  }
}

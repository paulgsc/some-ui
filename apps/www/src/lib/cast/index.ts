/**
 * The Cast wing (HOST8, #3532): Mochi and Tin Bird, every look each can
 * take, and every shot and placement a scene can give it, previewed as a
 * scene draws them (`@some-ui/styles/brand/host`'s `hostAt`, through
 * `@some-ui/shared`'s `HostPreview`).
 *
 * A look is a member of a character's closed sets: one of its emotions, or
 * one of its ceremonies, which plays over the ceremonious emotion. The lists
 * come from the host's unions, so an emotion or ceremony added there is a
 * look here with no change but its words (`./words`, which the compiler asks
 * for). Each loop is the host's own drawing: until HOST3 and HOST4 fill a
 * character's loops, each look shows that character's idle.
 *
 * Nothing here is kept: the wing previews, and a choice made in it lives in
 * the page's address alone (C1532).
 */
import type {
  Beat,
  CeremonyOf,
  EmotionOf,
  HostCharacter,
  Placement,
  Shot,
} from "@some-ui/styles/brand/host"
import {
  ceremoniesOf,
  emotionsOf,
  HOST_CHARACTERS,
  PLACEMENTS,
  SHOTS,
} from "@some-ui/styles/brand/host"

/** One look a character can take: an emotion, or a ceremony over the ceremonious one. */
type LookOf<C extends HostCharacter> =
  | {
      readonly character: C
      readonly kind: "emotion"
      readonly emotion: EmotionOf<C>
    }
  | {
      readonly character: C
      readonly kind: "ceremony"
      readonly ceremony: CeremonyOf<C>
    }

export type Look = { readonly [C in HostCharacter]: LookOf<C> }[HostCharacter]

/** What a look is called in the page's address: its member's own name, unique per character. */
export const lookId = (look: Look): string =>
  look.kind === "emotion" ? look.emotion : look.ceremony

/** Every look of one character: its emotions, in the host's order, then its ceremonies. */
const looksFor = <C extends HostCharacter>(
  who: C
): ReadonlyArray<LookOf<C>> => [
  ...emotionsOf(who).map(
    (emotion): LookOf<C> => ({ character: who, kind: "emotion", emotion })
  ),
  ...ceremoniesOf(who).map(
    (ceremony): LookOf<C> => ({ character: who, kind: "ceremony", ceremony })
  ),
]

/** Every look `who` can take: its emotions, in the host's order, then its ceremonies. */
export function looksOf(who: HostCharacter): ReadonlyArray<Look> {
  switch (who) {
    case "tin-owlet": {
      return looksFor("tin-owlet")
    }
    case "mochi": {
      return looksFor("mochi")
    }
    default: {
      const never: never = who
      throw new Error(`no such character: ${String(never)}`)
    }
  }
}

/** The character named `raw`, or the first when it names none. */
export function characterOf(raw: unknown): HostCharacter {
  return HOST_CHARACTERS.find((who) => who === raw) ?? HOST_CHARACTERS[0]
}

/** `who`'s look named `raw`, or undefined when it has none of that name. */
export function lookOf(who: HostCharacter, raw: unknown): Look | undefined {
  return looksOf(who).find((look) => lookId(look) === raw)
}

/** The shot named `raw`, or the medium shot. */
export const shotOf = (raw: unknown): Shot =>
  SHOTS.find((shot) => shot === raw) ?? "medium"

/** The placement named `raw`, or the bottom right corner, where a host most often sits. */
export const placementOf = (raw: unknown): Placement =>
  PLACEMENTS.find((placement) => placement === raw) ?? "bottom-right"

/** The look as a scene's one beat, from the start: what a scene with it would draw. */
export function beatOf(look: Look, shot: Shot, placement: Placement): Beat {
  const frame = { atMs: 0, shot, placement, speaking: false } as const
  switch (look.character) {
    case "tin-owlet": {
      return look.kind === "emotion"
        ? { ...frame, character: "tin-owlet", emotion: look.emotion }
        : {
            ...frame,
            character: "tin-owlet",
            emotion: "ceremonious",
            animation: look.ceremony,
          }
    }
    case "mochi": {
      return look.kind === "emotion"
        ? { ...frame, character: "mochi", emotion: look.emotion }
        : {
            ...frame,
            character: "mochi",
            emotion: "ceremonious",
            animation: look.ceremony,
          }
    }
    default: {
      const never: never = look
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

/**
 * Each look's seed: fixed, so a look always moves the same way, and
 * different from its neighbours', so a page of them does not blink as one.
 */
export function seedOf(look: Look): number {
  const at = looksOf(look.character).findIndex(
    (other) => lookId(other) === lookId(look)
  )
  return (HOST_CHARACTERS.indexOf(look.character) + 1) * 101 + at * 7
}

/** How many looks a page of the grid holds: two across, three down, on any phone. */
export const LOOKS_PER_PAGE = 6

/** The looks on page `page` (0-based), and how many pages there are. */
export function pageOfLooks<L>(
  looks: ReadonlyArray<L>,
  page: number
): {
  readonly looks: ReadonlyArray<L>
  readonly page: number
  readonly pageCount: number
} {
  const pageCount = Math.max(1, Math.ceil(looks.length / LOOKS_PER_PAGE))
  const at = Math.min(Math.max(0, Math.trunc(page)), pageCount - 1)
  return {
    looks: looks.slice(at * LOOKS_PER_PAGE, (at + 1) * LOOKS_PER_PAGE),
    page: at,
    pageCount,
  }
}

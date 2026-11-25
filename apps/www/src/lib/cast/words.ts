/**
 * Everything the Cast wing says (HOST8), in the person's terms, held by its
 * test to no machinery. Each table is keyed by the host's closed unions, so
 * a member added there fails `tsc` here until it has its words.
 */
import type {
  CeremonyOf,
  Emotion,
  HostCharacter,
  Placement,
  Shot,
} from "@some-ui/styles/brand/host"

import type { Look } from "./index"

/** A character's name, and who it stands for. */
type CharacterWords = { readonly name: string; readonly who: string }

const CHARACTERS: Readonly<Record<HostCharacter, CharacterWords>> = {
  "tin-owlet": { name: "Tin Bird", who: "the agent" },
  mochi: { name: "Mochi", who: "you" },
}

const EMOTIONS: Readonly<Record<Emotion, string>> = {
  neutral: "Neutral",
  curious: "Curious",
  taciturn: "Taciturn",
  happy: "Happy",
  perplexed: "Perplexed",
  anxious: "Anxious",
  frustrated: "Frustrated",
  angry: "Angry",
  ceremonious: "Ceremonious",
  question: "Asking",
  confusion: "Confused",
  issue: "Taking issue",
  intuition: "A hunch",
  hesitation: "Hesitant",
}

const CEREMONIES: Readonly<Record<CeremonyOf<HostCharacter>, string>> = {
  "nfl-celebration": "Touchdown celebration",
}

const SHOTS: Readonly<Record<Shot, string>> = {
  "close-up": "Close-up",
  medium: "Medium",
  long: "Long shot",
}

const PLACEMENTS: Readonly<Record<Placement, string>> = {
  "top-left": "Top left",
  "top-right": "Top right",
  center: "Center",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
}

export const CAST_WORDS = {
  /** The wing's name and what you come in for (C1531: the owner's to rename). */
  wing: {
    name: "Cast",
    job: "Mochi and Tin Bird: every feeling, shot and corner, as a video draws them",
  },
  characters: CHARACTERS,
  emotions: EMOTIONS,
  ceremonies: CEREMONIES,
  shots: SHOTS,
  placements: PLACEMENTS,
  /** The choice of character, for a screen reader. */
  pick: "Who to see",
  /** What the grid pages through, for a screen reader. */
  looksLabel: "feelings",
  /** The grid's heading. */
  looks: (who: HostCharacter): string =>
    `Every way ${CHARACTERS[who].name} can feel`,
  /** Under the grid: tapping a look opens it. */
  looksHint: "Tap one to see it in every shot and corner.",
  /** The look's page: its back link. */
  back: "All feelings",
  shot: "Shot",
  placement: "Where",
  /** The sample card the look stands over. */
  sample: {
    title: "A card from a video",
    body: "What a scene shows sits here, and the character stands over it.",
  },
  /** How the look's own name reads on its picture. */
  pictured: (look: Look, shot: Shot, placement: Placement): string =>
    `${CHARACTERS[look.character].name}, ${lookName(look)}: ${SHOTS[shot]}, ${PLACEMENTS[placement].toLowerCase()}`,
  /** Said once, when this phone asks for less motion. */
  still: "Held still, as this phone asks for less motion.",
} as const

/** A look's name: its emotion's or its ceremony's. */
export function lookName(look: Look): string {
  return look.kind === "emotion"
    ? EMOTIONS[look.emotion]
    : CEREMONIES[look.ceremony]
}

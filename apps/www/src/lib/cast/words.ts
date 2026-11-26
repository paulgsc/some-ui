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
import type {
  CostumePiece,
  Prop,
  Role,
  Theme,
} from "@some-ui/styles/brand/host-role"
import { roleLookOf } from "@some-ui/styles/brand/host-role"

import type { Look } from "./index"

/** A character's name. */
type CharacterWords = { readonly name: string }

const CHARACTERS: Readonly<Record<HostCharacter, CharacterWords>> = {
  "tin-owlet": { name: "Tin Bird" },
  mochi: { name: "Mochi" },
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
  hungry: "Hungry",
  question: "Asking",
  confusion: "Confused",
  issue: "Taking issue",
  intuition: "A hunch",
  hesitation: "Hesitant",
}

const CEREMONIES: Readonly<Record<CeremonyOf<HostCharacter>, string>> = {
  "nfl-celebration": "Touchdown celebration",
}

/** Each role's name (C1540). */
const ROLES: Readonly<Record<Role, string>> = {
  default: "Everyday",
  analyst: "Analyst",
  coach: "Coach",
  fan: "Fan",
  presenter: "Presenter",
}

/** Each theme, as the colours it reads as. */
const THEMES: Readonly<Record<Theme, string>> = {
  honey: "honey colours",
  tin: "tin colours",
  slate: "slate colours",
  field: "field green",
  team: "team red",
}

const PIECES: Readonly<Record<CostumePiece, string>> = {
  tie: "a tie",
  "bow-tie": "a bow tie",
  cap: "a cap",
  whistle: "a whistle",
  scarf: "a scarf",
}

const PROPS: Readonly<Record<Prop, string>> = {
  clipboard: "a clipboard",
  microphone: "a microphone",
  pennant: "a pennant",
}

/** What `who` looks like in `role`: its colours, what it wears and holds. */
function wears(who: HostCharacter, role: Role): string {
  const look = roleLookOf(who, role)
  const parts = [
    THEMES[look.theme],
    ...look.costume.map((piece) => PIECES[piece]),
    ...(look.prop === undefined ? [] : [`holding ${PROPS[look.prop]}`]),
  ]
  const [first = "", ...rest] = parts
  const said = [first.charAt(0).toUpperCase() + first.slice(1), ...rest]
  return said.length === 1
    ? `${String(said[0])}, nothing worn`
    : `${said.slice(0, -1).join(", ")} and ${String(said.at(-1))}`
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
  roles: ROLES,
  shots: SHOTS,
  placements: PLACEMENTS,
  /** The choice of role, for its chips' label (HOST7). */
  role: "Role",
  /** What the role chosen looks like, under its chips. */
  wears,
  /** The choice of character, for a screen reader. */
  pick: "Who to see",
  /** What the grid pages through, for a screen reader. */
  looksLabel: "feelings",
  /** The grid's heading. */
  looks: (who: HostCharacter): string =>
    `Every way ${CHARACTERS[who].name} can feel`,
  /** Under the grid: tapping a look opens it. */
  looksHint:
    "Tap one to see it in every shot and corner. A role changes the colours and what they wear; some feelings change the colour too.",
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
  pictured: (
    look: Look,
    role: Role,
    shot: Shot,
    placement: Placement
  ): string =>
    `${CHARACTERS[look.character].name}, ${lookName(look)}, ${ROLES[role].toLowerCase()}: ${SHOTS[shot]}, ${PLACEMENTS[placement].toLowerCase()}`,
} as const

/** A look's name: its emotion's or its ceremony's. */
export function lookName(look: Look): string {
  return look.kind === "emotion"
    ? EMOTIONS[look.emotion]
    : CEREMONIES[look.ceremony]
}

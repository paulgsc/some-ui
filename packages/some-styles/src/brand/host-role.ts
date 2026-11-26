/**
 * The role a character plays (HOST7, #3531), and the colour its feeling
 * gives it: two layers over a cast drawing, each a pure function of the
 * beat and t, drawn after the emotion's loop has posed the figure.
 *
 * - **A role has a look**, composed from three closed sets (C1540): a
 *   *theme* (a palette swap over the character's named colours), a
 *   *costume* (pieces worn on the character's anchors: a tie at the neck,
 *   a cap on the crown) and an optional *prop* held at its side (a
 *   clipboard, a microphone). Roles are keyed by character, so a role is a
 *   member of one character's set; today both have the same five. A new
 *   role is a new member of `ROLES` and an entry in `ROLE_LOOKS`; a new
 *   piece is a member of `COSTUME_PIECES` or `PROPS` and its drawing here,
 *   which the compiler asks for. Never a module of its own (C830).
 * - **A feeling has a colour** (C1541): some emotions tint the character
 *   (flushed when angry, pale when anxious, a glow when happy, wan when
 *   hungry). The tint is not a theme: it mixes the role's own colours
 *   toward the feeling's, so an angry analyst is a flushed slate and an
 *   angry fan a flushed red. It eases in over the loop's first moments and
 *   an angry one throbs, all a function of the time into the loop.
 *
 * How they compose: the emotion's loop poses the figure; the role's costume
 * and prop join the figure, so they move with it; then each of the
 * character's named colours is replaced by the role's theme's, mixed toward
 * the feeling's tint. Only the figure and the drawing's own gradients are
 * recoloured, never the signs a loop shows beside the character, and a
 * costume keeps its own cloth (`accent`, `trim`), so a feeling flushes the
 * face and leaves the tie its colour.
 *
 * Nothing here reads a clock or `Math.random`: the same beat and t give the
 * same SVG bytes (`__tests__/host-role.test.ts`).
 */

import { el, INK, type CastNode } from "./cast"
import { clamp, num, smooth, TAU } from "./host-draw"

/**
 * The characters this module dresses. It mirrors `./host`'s
 * `HOST_CHARACTERS`, which `./host` checks is the same set (it imports this
 * module, so this one can't import it back).
 */
type Who = "tin-owlet" | "mochi"

// ---- The closed sets ----

/**
 * Each character's roles: its everyday self, and the four a conversation
 * about a game or a build asks for most (C1540).
 */
export const ROLES = {
  "tin-owlet": ["default", "analyst", "coach", "fan", "presenter"],
  mochi: ["default", "analyst", "coach", "fan", "presenter"],
} as const satisfies Record<Who, ReadonlyArray<string>>

export type RoleOf<C extends Who> = (typeof ROLES)[C][number]
export type Role = RoleOf<Who>

/** Each character's themes: its own colours first, then the roles' own. */
export const THEMES = {
  "tin-owlet": ["tin", "slate", "field", "team"],
  mochi: ["honey", "slate", "field", "team"],
} as const satisfies Record<Who, ReadonlyArray<string>>

export type ThemeOf<C extends Who> = (typeof THEMES)[C][number]
export type Theme = ThemeOf<Who>

/** What a character can wear, each piece on one of its anchors. */
export const COSTUME_PIECES = [
  "tie",
  "bow-tie",
  "cap",
  "whistle",
  "scarf",
] as const
export type CostumePiece = (typeof COSTUME_PIECES)[number]

/** What a character can hold at its side. */
export const PROPS = ["clipboard", "microphone", "pennant"] as const
export type Prop = (typeof PROPS)[number]

/** A role's look: its theme, what it wears, and what it holds, if anything. */
export type RoleLookOf<C extends Who> = {
  readonly theme: ThemeOf<C>
  readonly costume: ReadonlyArray<CostumePiece>
  readonly prop?: Prop
}

/** Each character's roles, dressed (C1540): the owner's to move. */
export const ROLE_LOOKS: {
  readonly [C in Who]: Readonly<Record<RoleOf<C>, RoleLookOf<C>>>
} = {
  "tin-owlet": {
    default: { theme: "tin", costume: [] },
    analyst: { theme: "slate", costume: ["tie"], prop: "clipboard" },
    coach: { theme: "field", costume: ["cap", "whistle"] },
    fan: { theme: "team", costume: ["scarf"], prop: "pennant" },
    presenter: { theme: "tin", costume: ["bow-tie"], prop: "microphone" },
  },
  mochi: {
    default: { theme: "honey", costume: [] },
    analyst: { theme: "slate", costume: ["tie"], prop: "clipboard" },
    coach: { theme: "field", costume: ["cap", "whistle"] },
    fan: { theme: "team", costume: ["scarf"], prop: "pennant" },
    presenter: { theme: "honey", costume: ["bow-tie"], prop: "microphone" },
  },
}

/** Each character's roles, for a page listing them. */
export const rolesOf = <C extends Who>(who: C): ReadonlyArray<RoleOf<C>> =>
  ROLES[who]

/** What role `who` plays as `raw`, when it is one of its roles. */
export const roleOf = <C extends Who>(
  who: C,
  raw: unknown
): RoleOf<C> | undefined => rolesOf(who).find((role) => role === raw)

/** The look of `who` playing `role`. */
export const roleLookOf = <C extends Who>(
  who: C,
  role: RoleOf<C>
): RoleLookOf<C> => {
  const looks: Readonly<Record<RoleOf<C>, RoleLookOf<C>>> = ROLE_LOOKS[who]
  return looks[role]
}

// ---- Themes: a palette swap over each character's named colours ----

/** The mochi's named colours, as `./cast` draws them. */
type MochiSlot = "light" | "body" | "shade" | "feet" | "arm" | "glow" | "rim"

/** The tin owlet's named colours, as `./cast` draws them. */
type TinSlot =
  | "light"
  | "mid"
  | "sheen"
  | "dark"
  | "tuft"
  | "rivet"
  | "lens"
  | "rim"

type SlotOf<C extends Who> = C extends "mochi" ? MochiSlot : TinSlot

/** A theme: a colour for each named colour, and a cloth and trim its costume is cut from. */
type Palette<S extends string> = {
  readonly slots: Readonly<Record<S, string>>
  readonly accent: string
  readonly trim: string
}

const PALETTES: {
  readonly [C in Who]: Readonly<Record<ThemeOf<C>, Palette<SlotOf<C>>>>
} = {
  mochi: {
    // The drawing's own colours: the identity swap.
    honey: {
      slots: {
        light: "#ffe2a8",
        body: "#f5b75b",
        shade: "#c9781f",
        feet: "#c27622",
        arm: "#f2ae55",
        glow: "#ffd27a",
        rim: "#fff2cf",
      },
      accent: "#2f4a7a",
      trim: "#f4efe6",
    },
    slate: {
      slots: {
        light: "#e6ebf1",
        body: "#a3b2c4",
        shade: "#5c6d82",
        feet: "#55657a",
        arm: "#9dadc0",
        glow: "#cbd6e3",
        rim: "#f3f6fa",
      },
      accent: "#8c1f2c",
      trim: "#f0d9a0",
    },
    field: {
      slots: {
        light: "#dcf3c8",
        body: "#82c66e",
        shade: "#3f8a3a",
        feet: "#3a7d34",
        arm: "#7cbf68",
        glow: "#b8e4a3",
        rim: "#f0fae8",
      },
      accent: "#1f3d73",
      trim: "#f4efe6",
    },
    team: {
      slots: {
        light: "#ffcfc6",
        body: "#e4573f",
        shade: "#9c2b1e",
        feet: "#932a1f",
        arm: "#de5b46",
        glow: "#ff9f8b",
        rim: "#ffeae5",
      },
      accent: "#1f2f5c",
      trim: "#f8f8f8",
    },
  },
  "tin-owlet": {
    tin: {
      slots: {
        light: "#e9eef3",
        mid: "#b8c4cf",
        sheen: "#eef3f7",
        dark: "#6f7d8b",
        tuft: "#8b99a7",
        rivet: "#7c8a98",
        lens: "#4ff0d8",
        rim: "#d6f9ff",
      },
      accent: "#2f4a7a",
      trim: "#f4efe6",
    },
    slate: {
      slots: {
        light: "#cdd2da",
        mid: "#7f8998",
        sheen: "#d8dde4",
        dark: "#3f4753",
        tuft: "#5d6775",
        rivet: "#4d5663",
        lens: "#7fb6ff",
        rim: "#dde9ff",
      },
      accent: "#8c1f2c",
      trim: "#f0d9a0",
    },
    field: {
      slots: {
        light: "#f2dfc4",
        mid: "#c69e70",
        sheen: "#f7e8d3",
        dark: "#7a5634",
        tuft: "#a27c54",
        rivet: "#8a6642",
        lens: "#a4f06e",
        rim: "#f1ffe2",
      },
      accent: "#1f3d73",
      trim: "#f4efe6",
    },
    team: {
      slots: {
        light: "#ffd3cb",
        mid: "#d84b3b",
        sheen: "#ffe3dd",
        dark: "#8b2a20",
        tuft: "#b13b2f",
        rivet: "#f3f3f3",
        lens: "#ffd84f",
        rim: "#fff1d8",
      },
      accent: "#1f2f5c",
      trim: "#f8f8f8",
    },
  },
}

/** Each character's own colours: the theme every other is a swap of. */
const HOME_THEME: { readonly [C in Who]: ThemeOf<C> } = {
  "tin-owlet": "tin",
  mochi: "honey",
}

/** A theme's palette for `who`. */
function paletteOf<C extends Who>(
  who: C,
  theme: ThemeOf<C>
): Palette<SlotOf<C>> {
  const table: Readonly<Record<ThemeOf<C>, Palette<SlotOf<C>>>> = PALETTES[who]
  return table[theme]
}

// ---- Colour by feeling: a tint over the role's theme ----

/**
 * A feeling's colour: the role's colours mixed `amount` of the way toward
 * `toward`, and, for a feeling that throbs, by up to `pulse` more and less
 * once a `beatS`.
 */
export type Tint = {
  readonly toward: string
  readonly amount: number
  readonly pulse?: { readonly by: number; readonly beatS: number }
}

/**
 * Each feeling's tint, or none (C1541). Keyed by the emotion's name, so a
 * new emotion with a colour of its own is an entry here; `./host` holds
 * every emotion to a key of this table. The quiet and thinking ones keep
 * the role's colours as they are.
 */
export const EMOTION_TINTS = {
  neutral: null,
  curious: null,
  taciturn: null,
  perplexed: null,
  question: null,
  confusion: null,
  issue: null,
  intuition: null,
  hesitation: null,
  /** A glow: warmer and lighter. */
  happy: { toward: "#fff1b8", amount: 0.24 },
  /** Gilded, for a ceremony. */
  ceremonious: { toward: "#ffd76a", amount: 0.22 },
  /** Pale: drained toward grey-white. */
  anxious: { toward: "#eef1f4", amount: 0.45 },
  /** Warming toward a flush. */
  frustrated: { toward: "#e8553f", amount: 0.2 },
  /** Flushed, and throbbing. */
  angry: {
    toward: "#e0301e",
    amount: 0.4,
    pulse: { by: 0.08, beatS: 1.1 },
  },
  /** Wan: drained toward a sickly green (the owner, 2026-11-26). */
  hungry: { toward: "#b5c37a", amount: 0.38 },
} as const satisfies Readonly<Record<string, Tint | null>>

export type TintedEmotion = keyof typeof EMOTION_TINTS

/** How long a feeling's colour takes to rise from the start of its loop. */
export const TINT_RISE_MS = 600

/** How far toward its tint `emotion` has the character `tMs` into its loop, 0 to 1. */
export function tintAmountAt(emotion: TintedEmotion, tMs: number): number {
  const tint: Tint | null = EMOTION_TINTS[emotion]
  if (tint === null) return 0
  const rise = smooth(Math.max(0, tMs) / TINT_RISE_MS)
  const throb =
    tint.pulse === undefined
      ? 0
      : tint.pulse.by *
        Math.sin((TAU * Math.max(0, tMs)) / (1000 * tint.pulse.beatS))
  return clamp((tint.amount + throb) * rise, 0, 1)
}

/** The colour `emotion` gives the character `tMs` into its loop, or none. */
export function tintAt(
  emotion: TintedEmotion,
  tMs: number
): { readonly toward: string; readonly amount: number } | null {
  const tint: Tint | null = EMOTION_TINTS[emotion]
  return tint === null
    ? null
    : { toward: tint.toward, amount: tintAmountAt(emotion, tMs) }
}

/** `#rrggbb` as its three channels. */
const channels = (hex: string): readonly [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** `a` mixed `e` of the way toward `b`, as `#rrggbb`. */
export function mixHex(a: string, b: string, e: number): string {
  const from = channels(a)
  const to = channels(b)
  return `#${from
    .map((c, i) =>
      Math.round(c + ((to[i] ?? c) - c) * clamp(e, 0, 1))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

// ---- Costume and props: pieces worn on named anchors ----

/** Where a piece is worn: the top of the head, the neck, and the side a hand holds at. */
type Anchor = "crown" | "neck" | "hand"

/** Each character's anchors in the 96 box, and how large a piece is drawn there. */
const ANCHORS: {
  readonly [C in Who]: Readonly<
    Record<Anchor, { x: number; y: number; scale: number }>
  >
} = {
  // The mochi's hexagon: its flat top at y 26, its mouth at 66, its right side at 74.
  mochi: {
    crown: { x: 48, y: 27, scale: 1 },
    neck: { x: 48, y: 70, scale: 0.8 },
    hand: { x: 75, y: 66, scale: 1 },
  },
  // The owlet's dome tops out at 16 between its tufts; its chest line is at 60.
  "tin-owlet": {
    crown: { x: 48, y: 18, scale: 1.05 },
    neck: { x: 48, y: 59.5, scale: 0.85 },
    hand: { x: 71, y: 66, scale: 0.95 },
  },
}

const PIECE_ANCHOR: Readonly<Record<CostumePiece, Anchor>> = {
  tie: "neck",
  "bow-tie": "neck",
  cap: "crown",
  whistle: "neck",
  scarf: "neck",
}

/** The cloth a costume is cut from, and the hand a prop is held by. */
type Cloth = {
  readonly accent: string
  readonly trim: string
  readonly hand: string
}

const stroke = (width: number): Readonly<Record<string, string | number>> => ({
  stroke: INK,
  "stroke-width": width,
  "stroke-linejoin": "round",
  "stroke-linecap": "round",
})

/** Each piece, drawn about its anchor at 0 0. */
const PIECES: Readonly<
  Record<CostumePiece, (cloth: Cloth) => ReadonlyArray<CastNode>>
> = {
  tie: ({ accent, trim }) => [
    el("path", {
      d: "M-1.9 3.1L1.9 3.1L3.2 12.4L0 15.6L-3.2 12.4Z",
      fill: accent,
      ...stroke(0.7),
    }),
    el("path", {
      d: "M-1.6 6.4L1.9 4.6M-2.4 10L2.6 7.4M-2.2 13.4L2.9 10.8",
      stroke: trim,
      "stroke-width": 0.8,
      fill: "none",
    }),
    el("path", {
      d: "M-2.8 0L2.8 0L1.9 3.3L-1.9 3.3Z",
      fill: accent,
      ...stroke(0.7),
    }),
  ],
  "bow-tie": ({ accent, trim }) => [
    el("path", {
      d: "M0 1L-7 -3.2L-7.4 5.2Z M0 1L7 -3.2L7.4 5.2Z",
      fill: accent,
      ...stroke(0.7),
    }),
    el("rect", {
      x: -1.8,
      y: -1.2,
      width: 3.6,
      height: 4.4,
      rx: 1,
      fill: accent,
      ...stroke(0.7),
    }),
    el("path", {
      d: "M-5.6 -0.6L-5.6 2.8M5.6 -0.6L5.6 2.8",
      stroke: trim,
      "stroke-width": 0.7,
    }),
  ],
  cap: ({ accent, trim }) => [
    el("path", {
      d: "M-11 0Q2 -1.4 19 2.2Q6 4.6 -11 2.4Z",
      fill: trim,
      ...stroke(0.8),
    }),
    el("path", {
      d: "M-11 0.6A11 9.4 0 0 1 11 0.6Z",
      fill: accent,
      ...stroke(0.8),
    }),
    el("path", {
      d: "M0 -8.8L0 0.6M-6 -6.8Q-3.6 -2 -4.6 0.6",
      stroke: trim,
      "stroke-width": 0.7,
      fill: "none",
      opacity: 0.8,
    }),
    el("circle", { cx: 0, cy: -8.9, r: 1.3, fill: trim, ...stroke(0.5) }),
  ],
  whistle: ({ accent }) => [
    el("path", {
      d: "M-9 -3Q-3 6.8 0 8.6Q3 6.8 9 -3",
      fill: "none",
      stroke: accent,
      "stroke-width": 1.1,
    }),
    el("path", {
      d: "M-2.4 8.4L4.6 8.4L4.6 11.6L1.2 11.6A3.2 3.2 0 1 1 -2.4 8.4Z",
      fill: "#c9d3dc",
      ...stroke(0.6),
    }),
    el("circle", { cx: -1.2, cy: 11.4, r: 0.9, fill: INK }),
    el("path", {
      d: "M-1.6 9.4L3.6 9.4",
      stroke: "#ffffff",
      "stroke-width": 0.6,
      opacity: 0.8,
    }),
  ],
  scarf: ({ accent, trim }) => [
    el("path", {
      d: "M-15 -2.6Q0 4 15 -2.6L15 2.8Q0 9.4 -15 2.8Z",
      fill: accent,
      ...stroke(0.8),
    }),
    el("path", {
      d: "M-9.4 -0.2L-9.4 5.2M-3.2 1.4L-3.2 6.8M3.2 1.4L3.2 6.8M9.4 -0.2L9.4 5.2",
      stroke: trim,
      "stroke-width": 1.4,
    }),
    el("path", {
      d: "M6 4.4L10.6 4L12 14L7 14.6Z",
      fill: accent,
      ...stroke(0.8),
    }),
    el("path", {
      d: "M7.2 9.6L11.2 9.2M7.6 12.6L11.6 12.2",
      stroke: trim,
      "stroke-width": 1.1,
    }),
  ],
}

/** The hand a prop is held by: a nub of the character's own colour. */
const hand = (colour: string): CastNode =>
  el("ellipse", { cx: 0, cy: 0, rx: 3.4, ry: 3, fill: colour, ...stroke(0.7) })

/** Each prop, drawn with its grip at 0 0, the hand over the grip. */
const PROP_DRAWINGS: Readonly<
  Record<Prop, (cloth: Cloth) => ReadonlyArray<CastNode>>
> = {
  clipboard: ({ hand: colour }) => [
    el("rect", {
      x: -2,
      y: -12,
      width: 14,
      height: 18,
      rx: 1.4,
      fill: "#a8743f",
      ...stroke(0.7),
      transform: "rotate(8)",
    }),
    el("g", { transform: "rotate(8)" }, [
      el("rect", {
        x: -0.4,
        y: -9.6,
        width: 10.8,
        height: 13.8,
        fill: "#fbfaf6",
      }),
      el("path", {
        d: "M1.4 -6H8.6M1.4 -3H8.6M1.4 0H6.6",
        stroke: "#8a96a3",
        "stroke-width": 0.7,
      }),
      el("rect", {
        x: 2.2,
        y: -13.2,
        width: 5.6,
        height: 3,
        rx: 0.8,
        fill: "#c9d3dc",
        ...stroke(0.5),
      }),
    ]),
    hand(colour),
  ],
  microphone: ({ hand: colour }) => [
    el("g", { transform: "rotate(-18)" }, [
      el("rect", {
        x: -1.5,
        y: -6,
        width: 3,
        height: 12,
        rx: 1.2,
        fill: "#2b2f36",
        ...stroke(0.5),
      }),
      el("circle", { cx: 0, cy: -9, r: 4, fill: "#9aa5b1", ...stroke(0.7) }),
      el("path", {
        d: "M-3 -9.6H3M-2.6 -7.8H2.6M-1.6 -11.6V-6.4M1.6 -11.6V-6.4",
        stroke: "#5d6773",
        "stroke-width": 0.5,
      }),
    ]),
    hand(colour),
  ],
  pennant: ({ accent, trim, hand: colour }) => [
    el("path", {
      d: "M0 6L0 -16",
      stroke: "#6b432a",
      "stroke-width": 1.4,
      "stroke-linecap": "round",
    }),
    el("path", { d: "M0 -16L15 -11.4L0 -7Z", fill: accent, ...stroke(0.7) }),
    el("path", {
      d: "M2.2 -13.6L8.6 -11.6L2.2 -9.4",
      fill: "none",
      stroke: trim,
      "stroke-width": 1,
    }),
    hand(colour),
  ],
}

/** A piece at its anchor, named for a loop that might move it. */
const worn = (
  part: string,
  at: { x: number; y: number; scale: number },
  children: ReadonlyArray<CastNode>
): CastNode =>
  el(
    "g",
    {
      "data-part": part,
      transform: `translate(${num(at.x)} ${num(at.y)}) scale(${num(at.scale)})`,
    },
    children
  )

/** The colour a hand is drawn in before the theme is applied: the character's own body colour. */
const HAND_SLOT: { readonly [C in Who]: SlotOf<C> } = {
  mochi: "body",
  "tin-owlet": "mid",
}

/** What `who` wears and holds for `look`, as nodes for its figure. */
function dressing<C extends Who>(
  who: C,
  look: RoleLookOf<C>
): ReadonlyArray<CastNode> {
  const own = paletteOf(who, HOME_THEME[who])
  const { accent, trim } = paletteOf(who, look.theme)
  const anchors = ANCHORS[who]
  const handSlot: SlotOf<C> = HAND_SLOT[who]
  const cloth: Cloth = { accent, trim, hand: own.slots[handSlot] }
  const pieces = look.costume.map((piece) =>
    worn(`costume-${piece}`, anchors[PIECE_ANCHOR[piece]], PIECES[piece](cloth))
  )
  return look.prop === undefined
    ? pieces
    : [
        ...pieces,
        worn(
          `prop-${look.prop}`,
          anchors.hand,
          PROP_DRAWINGS[look.prop](cloth)
        ),
      ]
}

/** `nodes` with `extra` drawn last inside every node named `part`. */
const within = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  extra: ReadonlyArray<CastNode>
): ReadonlyArray<CastNode> =>
  extra.length === 0
    ? nodes
    : nodes.map((node) =>
        node.attrs["data-part"] === part
          ? { ...node, children: [...(node.children ?? []), ...extra] }
          : node.children === undefined
            ? node
            : { ...node, children: within(node.children, part, extra) }
      )

const PAINTS = ["fill", "stroke", "stop-color"] as const

/** `nodes` with every paint named in `swap` replaced, all the way down. */
const repainted = (
  nodes: ReadonlyArray<CastNode>,
  swap: ReadonlyMap<string, string>
): ReadonlyArray<CastNode> =>
  nodes.map((node) => {
    let attrs = node.attrs
    for (const paint of PAINTS) {
      const was = attrs[paint]
      const to =
        typeof was === "string" ? swap.get(was.toLowerCase()) : undefined
      if (to !== undefined) attrs = { ...attrs, [paint]: to }
    }
    return node.children === undefined
      ? { tag: node.tag, attrs }
      : { tag: node.tag, attrs, children: repainted(node.children, swap) }
  })

/**
 * `who`'s drawing in `look`, flushed `amount` toward `tint`: the costume
 * joins the figure, then the figure and the drawing's own gradients are
 * repainted. The signs a loop draws beside the figure keep their colours.
 */
export function dressed<C extends Who>(
  who: C,
  nodes: ReadonlyArray<CastNode>,
  look: RoleLookOf<C>,
  tint: { readonly toward: string; readonly amount: number } | null
): ReadonlyArray<CastNode> {
  const worn = within(nodes, "figure", dressing(who, look))
  const own: Readonly<Record<string, string>> = paletteOf(
    who,
    HOME_THEME[who]
  ).slots
  const theirs: Readonly<Record<string, string>> = paletteOf(
    who,
    look.theme
  ).slots
  const swap = new Map<string, string>()
  for (const [slot, was] of Object.entries(own)) {
    const colour = theirs[slot] ?? was
    const to =
      tint === null || tint.amount === 0
        ? colour
        : mixHex(colour, tint.toward, tint.amount)
    if (to !== was) swap.set(was, to)
  }
  if (swap.size === 0) return worn
  return worn.map((node) =>
    node.tag === "defs" || node.attrs["data-part"] === "figure"
      ? (repainted([node], swap)[0] ?? node)
      : node
  )
}

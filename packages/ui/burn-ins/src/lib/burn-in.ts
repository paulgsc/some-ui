/**
 * The burn-in contract (STUDIO ST15): what code draws into a video's frame.
 *
 * A burn-in is a `kind` (a closed union), a named, frozen `design` of how it
 * looks, and `params`, this video's data for it, carried in the cut list
 * (`@some-ui/video-render`'s `BurnInSchema`). `prepare` validates the params
 * against the kind's schema once, saying every reason they can't be drawn,
 * and `frameAt` gives what is on screen `t` ms after the burn-in starts: pure,
 * so the preview page, the recorder and a test agree at every moment. A
 * burn-in is prepared for one frame (`./geometry`: the 9:16 short or the
 * 16:9 video), and laid out from that frame's regions.
 *
 * A design a published video used is never edited; a change is a new design.
 * Each kind draws only inside its regions (`./geometry`), so two burn-ins on
 * screen together never cover each other.
 */

import { assertNever } from "@some-ui/intent-kit"
import { z } from "zod"

import {
  AUTHORSHIP_DESIGNS,
  authorshipAt,
  authorshipBoxes,
  AuthorshipParamsSchema,
  drawAuthorship,
  type AuthorshipDrawing,
  type AuthorshipFrame,
} from "./authorship"
import {
  badgeBoxes,
  drawStatusBadge,
  STATUS_BADGE_DESIGNS,
  statusBadgeAt,
  StatusBadgeParamsSchema,
  type StatusBadgeDrawing,
  type StatusBadgeFrame,
} from "./badge"
import { frameAt as captionFrameAt, type CaptionFrame } from "./captions/frame"
import {
  isThemeId,
  sizedFor,
  THEME_IDS,
  THEMES,
  type CaptionTheme,
  type ThemeId,
} from "./captions/theme"
import { captionsFor, runtimeOf, type Caption } from "./captions/timing"
import {
  CHEAT_SHEET_DESIGNS,
  cheatSheetAt,
  cheatSheetBoxes,
  CheatSheetParamsSchema,
  drawCheatSheet,
  type CheatSheetDrawing,
  type CheatSheetFrame,
} from "./cheat-sheet"
import {
  drawGameCard,
  GAME_CARD_DESIGNS,
  gameCardBoxes,
  GameCardParamsSchema,
  type GameCardFrame,
} from "./game-card"
import {
  frameProblem,
  geometryOf,
  type Box,
  type FrameSize,
  type Geometry,
  type Region,
} from "./geometry"
import {
  cardFrame,
  CardParamsSchema,
  headlineFrame,
  HeadlineParamsSchema,
  JOURNAL_DESIGNS,
  textBoxes,
  type TextFrame,
} from "./journal"
import {
  drawLegend,
  LEGEND_DESIGNS,
  legendAt,
  legendBoxes,
  LegendParamsSchema,
  type LegendDrawing,
  type LegendFrame,
} from "./legend"
import { isOneOf, type Parsed } from "./parsed"
import {
  drawPreviewMark,
  PREVIEW_MARK_DESIGNS,
  PreviewMarkParamsSchema,
} from "./preview-mark"
import {
  drawRule,
  RULE_DESIGNS,
  ruleAt,
  ruleBoxes,
  RuleParamsSchema,
  type RuleDrawing,
  type RuleFrame,
} from "./rule"
import {
  drawTerminal,
  TERMINAL_DESIGNS,
  terminalAt,
  terminalBoxes,
  TerminalParamsSchema,
  type TerminalDrawing,
  type TerminalFrame,
} from "./terminal"

export const KINDS = [
  "captions",
  "headline",
  "card",
  "authorship",
  "game-card",
  "preview-mark",
  "status-badge",
  "terminal",
  "cheat-sheet",
  "legend",
  "rule",
] as const
export type Kind = (typeof KINDS)[number]

export const isKind = (value: unknown): value is Kind => isOneOf(KINDS, value)

/** Each kind's designs, the first its default. */
export const DESIGNS = {
  captions: THEME_IDS,
  headline: JOURNAL_DESIGNS,
  card: JOURNAL_DESIGNS,
  authorship: AUTHORSHIP_DESIGNS,
  "game-card": GAME_CARD_DESIGNS,
  "preview-mark": PREVIEW_MARK_DESIGNS,
  "status-badge": STATUS_BADGE_DESIGNS,
  terminal: TERMINAL_DESIGNS,
  "cheat-sheet": CHEAT_SHEET_DESIGNS,
  legend: LEGEND_DESIGNS,
  rule: RULE_DESIGNS,
} as const satisfies Record<Kind, ReadonlyArray<string>>

/** Where each kind draws. */
export const REGIONS_OF = {
  captions: ["lower-third"],
  headline: ["header"],
  card: ["header", "body"],
  // The intro and end card hold a bare card's header and body; between
  // them the mark keeps to the gutter.
  authorship: ["gutter", "header", "body"],
  // A panel at the body's top, under a scene's headline, over its picture.
  "game-card": ["body"],
  // Under the safe area, where only what is never uploaded sits.
  "preview-mark": ["foot"],
  // At the body's top left, over the scene's picture or a bare card.
  "status-badge": ["body"],
  // A card over a bare scene: its title in the header, its window in the body.
  terminal: ["header", "body"],
  "cheat-sheet": ["header", "body"],
  legend: ["header", "body"],
  rule: ["header", "body"],
} as const satisfies Record<Kind, ReadonlyArray<Region>>

const TimedWordSchema = z
  .object({
    text: z.string().min(1),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
  })
  .refine((w) => w.endMs >= w.startMs, {
    message: "a word ends after it starts",
  })

const CaptionParamsSchema = z.object({
  /** The speaker's lines, each word with when it is said. */
  lines: z.array(z.object({ words: z.array(TimedWordSchema).min(1) })),
})

/** A burn-in as the cut list carries it. */
export type BurnInData = {
  readonly kind: string
  readonly design: string
  readonly params: unknown
}

/** A burn-in whose params are checked, ready to draw at any time. */
export type Prepared =
  | {
      readonly kind: "captions"
      readonly design: ThemeId
      /** The design's look, sized for the frame. */
      readonly theme: CaptionTheme
      readonly geometry: Geometry
      readonly captions: ReadonlyArray<Caption>
    }
  | {
      readonly kind: "headline" | "card"
      readonly design: (typeof JOURNAL_DESIGNS)[number]
      readonly frame: TextFrame
    }
  | {
      readonly kind: "authorship"
      readonly design: (typeof AUTHORSHIP_DESIGNS)[number]
      readonly drawing: AuthorshipDrawing
    }
  | {
      readonly kind: "game-card"
      readonly design: (typeof GAME_CARD_DESIGNS)[number]
      readonly frame: GameCardFrame
    }
  | {
      readonly kind: "preview-mark"
      readonly design: (typeof PREVIEW_MARK_DESIGNS)[number]
      readonly frame: TextFrame
    }
  | {
      readonly kind: "status-badge"
      readonly design: (typeof STATUS_BADGE_DESIGNS)[number]
      readonly drawing: StatusBadgeDrawing
    }
  | {
      readonly kind: "terminal"
      readonly design: (typeof TERMINAL_DESIGNS)[number]
      readonly drawing: TerminalDrawing
    }
  | {
      readonly kind: "cheat-sheet"
      readonly design: (typeof CHEAT_SHEET_DESIGNS)[number]
      readonly drawing: CheatSheetDrawing
    }
  | {
      readonly kind: "legend"
      readonly design: (typeof LEGEND_DESIGNS)[number]
      readonly drawing: LegendDrawing
    }
  | {
      readonly kind: "rule"
      readonly design: (typeof RULE_DESIGNS)[number]
      readonly drawing: RuleDrawing
    }

/** What is on screen at a moment. */
export type BurnInFrame =
  | {
      readonly kind: "captions"
      readonly design: ThemeId
      /** The design's look, sized for the frame. */
      readonly theme: CaptionTheme
      readonly frame: CaptionFrame
    }
  | {
      readonly kind: "headline" | "card"
      readonly design: (typeof JOURNAL_DESIGNS)[number]
      readonly frame: TextFrame
    }
  | {
      readonly kind: "authorship"
      readonly design: (typeof AUTHORSHIP_DESIGNS)[number]
      readonly frame: AuthorshipFrame
    }
  | {
      readonly kind: "game-card"
      readonly design: (typeof GAME_CARD_DESIGNS)[number]
      readonly frame: GameCardFrame
    }
  | {
      readonly kind: "preview-mark"
      readonly design: (typeof PREVIEW_MARK_DESIGNS)[number]
      readonly frame: TextFrame
    }
  | {
      readonly kind: "status-badge"
      readonly design: (typeof STATUS_BADGE_DESIGNS)[number]
      readonly frame: StatusBadgeFrame
    }
  | {
      readonly kind: "terminal"
      readonly design: (typeof TERMINAL_DESIGNS)[number]
      readonly frame: TerminalFrame
    }
  | {
      readonly kind: "cheat-sheet"
      readonly design: (typeof CHEAT_SHEET_DESIGNS)[number]
      readonly frame: CheatSheetFrame
    }
  | {
      readonly kind: "legend"
      readonly design: (typeof LEGEND_DESIGNS)[number]
      readonly frame: LegendFrame
    }
  | {
      readonly kind: "rule"
      readonly design: (typeof RULE_DESIGNS)[number]
      readonly frame: RuleFrame
    }

const issues = (name: string, error: z.ZodError): ReadonlyArray<string> =>
  error.issues.map(
    (i) =>
      `${name}: ${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`
  )

/** A kind's design and params checked, and drawn by `draw`. */
function checked<D extends string, P, V>(
  name: string,
  designs: ReadonlyArray<D>,
  b: BurnInData,
  schema: z.ZodType<P>,
  draw: (params: P, g: Geometry) => Parsed<V>,
  g: Geometry
): Parsed<{ readonly design: D; readonly value: V }> {
  if (!isOneOf(designs, b.design))
    return { ok: false, problems: [`${name}: no such design`] }
  const params = schema.safeParse(b.params)
  if (!params.success)
    return { ok: false, problems: issues(name, params.error) }
  const drawn = draw(params.data, g)
  if (!drawn.ok)
    return { ok: false, problems: drawn.problems.map((p) => `${name}: ${p}`) }
  return { ok: true, value: { design: b.design, value: drawn.value } }
}

/** A Build Journal kind's params checked and set. */
function journal<P>(
  name: string,
  kind: "headline" | "card",
  b: BurnInData,
  schema: z.ZodType<P>,
  draw: (params: P, g: Geometry) => Parsed<TextFrame>,
  g: Geometry
): Parsed<Prepared> {
  const c = checked(name, JOURNAL_DESIGNS, b, schema, draw, g)
  return c.ok
    ? {
        ok: true,
        value: { kind, design: c.value.design, frame: c.value.value },
      }
    : c
}

/** A burn-in as a problem names it: `the captions burn-in (bold)`. */
export const burnInName = (b: Pick<BurnInData, "kind" | "design">): string =>
  `the ${b.kind} burn-in (${b.design})`

/**
 * The burn-in checked and ready to draw into `frame`, or every reason it
 * can't be drawn there.
 */
export function prepare(b: BurnInData, frame: FrameSize): Parsed<Prepared> {
  const name = burnInName(b)
  const unsupported = frameProblem(frame)
  if (unsupported !== null)
    return { ok: false, problems: [`${name}: ${unsupported}`] }
  const g = geometryOf(frame)
  if (!isKind(b.kind)) return { ok: false, problems: [`${name}: no such kind`] }
  const kind = b.kind
  switch (kind) {
    case "captions": {
      if (!isThemeId(b.design))
        return { ok: false, problems: [`${name}: no such design`] }
      const params = CaptionParamsSchema.safeParse(b.params)
      if (!params.success)
        return { ok: false, problems: issues(name, params.error) }
      const theme = sizedFor(THEMES[b.design], g)
      return {
        ok: true,
        value: {
          kind,
          design: b.design,
          theme,
          geometry: g,
          captions: captionsFor(params.data.lines, theme, g),
        },
      }
    }
    case "headline": {
      return journal(name, kind, b, HeadlineParamsSchema, headlineFrame, g)
    }
    case "card": {
      return journal(name, kind, b, CardParamsSchema, cardFrame, g)
    }
    case "authorship": {
      const c = checked(
        name,
        AUTHORSHIP_DESIGNS,
        b,
        AuthorshipParamsSchema,
        drawAuthorship,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    case "game-card": {
      const c = checked(
        name,
        GAME_CARD_DESIGNS,
        b,
        GameCardParamsSchema,
        drawGameCard,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, frame: c.value.value },
          }
        : c
    }
    case "preview-mark": {
      const c = checked(
        name,
        PREVIEW_MARK_DESIGNS,
        b,
        PreviewMarkParamsSchema,
        drawPreviewMark,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, frame: c.value.value },
          }
        : c
    }
    case "status-badge": {
      const c = checked(
        name,
        STATUS_BADGE_DESIGNS,
        b,
        StatusBadgeParamsSchema,
        drawStatusBadge,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    case "terminal": {
      const c = checked(
        name,
        TERMINAL_DESIGNS,
        b,
        TerminalParamsSchema,
        drawTerminal,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    case "cheat-sheet": {
      const c = checked(
        name,
        CHEAT_SHEET_DESIGNS,
        b,
        CheatSheetParamsSchema,
        drawCheatSheet,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    case "legend": {
      const c = checked(
        name,
        LEGEND_DESIGNS,
        b,
        LegendParamsSchema,
        drawLegend,
        g
      )
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    case "rule": {
      const c = checked(name, RULE_DESIGNS, b, RuleParamsSchema, drawRule, g)
      return c.ok
        ? {
            ok: true,
            value: { kind, design: c.value.design, drawing: c.value.value },
          }
        : c
    }
    default: {
      return assertNever(kind)
    }
  }
}

/** What the burn-in shows `t` ms after it starts. */
export function frameAt(p: Prepared, t: number): BurnInFrame {
  switch (p.kind) {
    case "captions": {
      return {
        kind: p.kind,
        design: p.design,
        theme: p.theme,
        frame: captionFrameAt(p.captions, p.theme, p.geometry, t),
      }
    }
    case "headline":
    case "card":
    case "game-card":
    case "preview-mark": {
      return p
    }
    case "authorship": {
      return {
        kind: p.kind,
        design: p.design,
        frame: authorshipAt(p.drawing, t),
      }
    }
    case "status-badge": {
      return {
        kind: p.kind,
        design: p.design,
        frame: statusBadgeAt(p.drawing, t),
      }
    }
    case "terminal": {
      return {
        kind: p.kind,
        design: p.design,
        frame: terminalAt(p.drawing, t),
      }
    }
    case "cheat-sheet": {
      return {
        kind: p.kind,
        design: p.design,
        frame: cheatSheetAt(p.drawing, t),
      }
    }
    case "legend": {
      return { kind: p.kind, design: p.design, frame: legendAt(p.drawing, t) }
    }
    case "rule": {
      return { kind: p.kind, design: p.design, frame: ruleAt(p.drawing, t) }
    }
    default: {
      return assertNever(p)
    }
  }
}

/** How long the burn-in has something to show, in ms; null for as long as it lasts. */
export function runtimeMs(p: Prepared): number | null {
  return p.kind === "captions" ? runtimeOf(p.captions) : null
}

/** The boxes a frame covers, for placement checks. */
export function boxesOf(f: BurnInFrame): ReadonlyArray<Box> {
  switch (f.kind) {
    case "captions": {
      return f.frame.caption === null ? [] : [f.frame.layout.box]
    }
    case "headline":
    case "card":
    case "preview-mark": {
      return textBoxes(f.frame)
    }
    case "authorship": {
      return authorshipBoxes(f.frame)
    }
    case "game-card": {
      return gameCardBoxes(f.frame)
    }
    case "status-badge": {
      return f.frame.marks.flatMap(badgeBoxes)
    }
    case "terminal": {
      return terminalBoxes(f.frame)
    }
    case "cheat-sheet": {
      return cheatSheetBoxes(f.frame)
    }
    case "legend": {
      return legendBoxes(f.frame)
    }
    case "rule": {
      return ruleBoxes(f.frame)
    }
    default: {
      return assertNever(f)
    }
  }
}

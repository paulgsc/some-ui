/**
 * The burn-in contract (STUDIO ST15): what code draws into a video's frame.
 *
 * A burn-in is a `kind` (a closed union), a named, frozen `design` of how it
 * looks, and `params`, this video's data for it, carried in the cut list
 * (`@some-ui/video-render`'s `BurnInSchema`). `prepare` validates the params
 * against the kind's schema once, saying every reason they can't be drawn,
 * and `frameAt` gives what is on screen `t` ms after the burn-in starts: pure,
 * so the preview page, the recorder and a test agree at every moment.
 *
 * A design a published video used is never edited; a change is a new design.
 * Each kind draws only inside its regions (`./geometry`), so two burn-ins on
 * screen together never cover each other.
 */

import { assertNever } from "@some-ui/intent-kit"
import { z } from "zod"

import { frameAt as captionFrameAt, type CaptionFrame } from "./captions/frame"
import { isThemeId, THEME_IDS, THEMES, type ThemeId } from "./captions/theme"
import { captionsFor, runtimeOf, type Caption } from "./captions/timing"
import type { Box, Region } from "./geometry"
import {
  cardFrame,
  CardParamsSchema,
  headlineFrame,
  HeadlineParamsSchema,
  JOURNAL_DESIGNS,
  textBoxes,
  type TextFrame,
} from "./journal"
import { isOneOf, type Parsed } from "./parsed"

export const KINDS = ["captions", "headline", "card"] as const
export type Kind = (typeof KINDS)[number]

export const isKind = (value: unknown): value is Kind => isOneOf(KINDS, value)

/** Each kind's designs, the first its default. */
export const DESIGNS = {
  captions: THEME_IDS,
  headline: JOURNAL_DESIGNS,
  card: JOURNAL_DESIGNS,
} as const satisfies Record<Kind, ReadonlyArray<string>>

/** Where each kind draws. */
export const REGIONS_OF = {
  captions: ["lower-third"],
  headline: ["header"],
  card: ["header", "body"],
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
      readonly captions: ReadonlyArray<Caption>
    }
  | {
      readonly kind: "headline" | "card"
      readonly design: (typeof JOURNAL_DESIGNS)[number]
      readonly frame: TextFrame
    }

/** What is on screen at a moment. */
export type BurnInFrame =
  | {
      readonly kind: "captions"
      readonly design: ThemeId
      readonly frame: CaptionFrame
    }
  | {
      readonly kind: "headline" | "card"
      readonly design: (typeof JOURNAL_DESIGNS)[number]
      readonly frame: TextFrame
    }

const issues = (name: string, error: z.ZodError): ReadonlyArray<string> =>
  error.issues.map(
    (i) =>
      `${name}: ${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`
  )

/** A Build Journal kind's params checked and set. */
function journal<P>(
  name: string,
  kind: "headline" | "card",
  b: BurnInData,
  schema: z.ZodType<P>,
  draw: (params: P) => Parsed<TextFrame>
): Parsed<Prepared> {
  if (!isOneOf(JOURNAL_DESIGNS, b.design))
    return { ok: false, problems: [`${name}: no such design`] }
  const params = schema.safeParse(b.params)
  if (!params.success)
    return { ok: false, problems: issues(name, params.error) }
  const fitted = draw(params.data)
  if (!fitted.ok)
    return { ok: false, problems: fitted.problems.map((p) => `${name}: ${p}`) }
  return { ok: true, value: { kind, design: b.design, frame: fitted.value } }
}

/** The burn-in checked and ready, or every reason it can't be drawn. */
export function prepare(b: BurnInData): Parsed<Prepared> {
  const name = `the ${b.kind} burn-in (${b.design})`
  if (!isKind(b.kind)) return { ok: false, problems: [`${name}: no such kind`] }
  const kind = b.kind
  switch (kind) {
    case "captions": {
      if (!isThemeId(b.design))
        return { ok: false, problems: [`${name}: no such design`] }
      const params = CaptionParamsSchema.safeParse(b.params)
      if (!params.success)
        return { ok: false, problems: issues(name, params.error) }
      return {
        ok: true,
        value: {
          kind,
          design: b.design,
          captions: captionsFor(params.data.lines, THEMES[b.design]),
        },
      }
    }
    case "headline": {
      return journal(name, kind, b, HeadlineParamsSchema, headlineFrame)
    }
    case "card": {
      return journal(name, kind, b, CardParamsSchema, cardFrame)
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
        frame: captionFrameAt(p.captions, THEMES[p.design], t),
      }
    }
    case "headline":
    case "card": {
      return p
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
    case "card": {
      return textBoxes(f.frame)
    }
    default: {
      return assertNever(f)
    }
  }
}

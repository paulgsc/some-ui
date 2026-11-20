/**
 * The phone's own screens, photographed for an essay (RR31, #3288; call
 * C790): one picture per Rust Rounds ticket, as the phone's card draws it
 * from the owner's week, and the parts of it the narration can point at,
 * each named and boxed, so a scene can zoom to one (W2's zoom scene).
 *
 * The capture (www's `record:essay --week-file`, `tests/record/screens.ts`)
 * writes `screens.json` (`some-ui.screens/1`) beside the pictures; this
 * module is its one reading.
 *
 * A region is named in the essay's own keys (`RegionRef`), so a scene names
 * one from data it already holds:
 *
 * - `<TICKET>:question`: the ticket's title and spec;
 * - `<TICKET>:point:<n>`: speak-to point n, from 1, in the essay's order;
 * - `<TICKET>:program`: the program's code card;
 * - `<TICKET>:run`: rustc's whole result;
 * - `<TICKET>:diagnostic:<n>`: rustc's diagnostic n, from 1, in rustc's order.
 *
 * The card carries them as `data-region="<ref>"`. One ref on several
 * elements (a title and its spec) is one region, the box around them all
 * (`regionsOf`).
 */

import { z } from "zod"

import type { Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"
import { weekId } from "./essay"

export const SCREENS_SCHEMA = "some-ui.screens/1"

/** A ticket's key, as the week writes it (`QM-311`). */
const TICKET = "[A-Z][A-Z0-9]{0,5}-\\d{1,6}"

/** What a region of a ticket's screen is. */
export const REGION_KINDS = [
  "question",
  "point",
  "program",
  "run",
  "diagnostic",
] as const
export type RegionKind = (typeof REGION_KINDS)[number]

/** The kinds that come one of several, numbered from 1. */
const NUMBERED: ReadonlySet<RegionKind> = new Set(["point", "diagnostic"])

const REF = new RegExp(
  `^(${TICKET}):(question|program|run|(point|diagnostic):([1-9]\\d{0,2}))$`
)

/** A region's name: `QM-311:program`, `QM-311:diagnostic:2`. */
export type RegionRef = string

/** A region's name read into its parts. */
export type RegionName = {
  readonly ticket: string
  readonly kind: RegionKind
  /** From 1, for a point or a diagnostic; null for the others. */
  readonly n: number | null
}

/** `ref` read into its parts, or null when it names no region. */
export function parseRegionRef(ref: string): RegionName | null {
  const match = REF.exec(ref)
  if (!match) return null
  const [, ticket, whole, numbered, n] = match
  if (ticket === undefined || whole === undefined) return null
  const kind = REGION_KINDS.find((each) => each === (numbered ?? whole))
  if (kind === undefined) return null
  return { ticket, kind, n: n === undefined ? null : Number(n) }
}

/** The name of a region of `ticket`'s screen. */
export function regionRef(
  ticket: string,
  kind: RegionKind,
  n?: number
): RegionRef {
  const ref = NUMBERED.has(kind)
    ? `${ticket}:${kind}:${String(n)}`
    : `${ticket}:${kind}`
  if (parseRegionRef(ref) === null) throw new Error(`no region ${ref}`)
  return ref
}

const regionRefSchema = z
  .string()
  .refine(
    (ref) => parseRegionRef(ref) !== null,
    "a region is named like QM-311:program or QM-311:diagnostic:1"
  )

const px = z.number().nonnegative()

/** A box in CSS pixels, from the picture's top-left. */
const BoxSchema = z.strictObject({
  x: px,
  y: px,
  width: px.positive(),
  height: px.positive(),
})
export type Box = z.infer<typeof BoxSchema>

const RegionSchema = z.strictObject({ ref: regionRefSchema, box: BoxSchema })
export type Region = z.infer<typeof RegionSchema>

const ScreenSchema = z
  .strictObject({
    /** The ticket's key. */
    id: z.string().regex(new RegExp(`^${TICKET}$`), "a ticket's key"),
    /** The picture, beside `screens.json`. */
    file: z.string().regex(/^[A-Za-z0-9-]+\.png$/, "a PNG beside the record"),
    /** The whole picture in CSS pixels: the card, taller than the phone when it scrolls. */
    width: px.positive(),
    height: px.positive(),
    /** Device pixels per CSS pixel. */
    scale: z.number().int().min(1).max(4),
    /** The phone it was drawn for, in CSS pixels. */
    viewport: z.strictObject({ width: px.positive(), height: px.positive() }),
    regions: z.array(RegionSchema),
  })
  .superRefine((screen, ctx) => {
    const seen = new Set<string>()
    screen.regions.forEach(({ ref, box }, i) => {
      if (seen.has(ref))
        ctx.addIssue({
          code: "custom",
          path: ["regions", i, "ref"],
          message: `${ref} is named twice`,
        })
      seen.add(ref)
      if (parseRegionRef(ref)?.ticket !== screen.id)
        ctx.addIssue({
          code: "custom",
          path: ["regions", i, "ref"],
          message: `${ref} is not a region of ${screen.id}`,
        })
      if (
        box.x + box.width > screen.width + 0.5 ||
        box.y + box.height > screen.height + 0.5
      )
        ctx.addIssue({
          code: "custom",
          path: ["regions", i, "box"],
          message: `${ref} falls outside the picture`,
        })
    })
  })
export type Screen = z.infer<typeof ScreenSchema>

const ScreensSchema = z
  .strictObject({
    schema: z.literal(SCREENS_SCHEMA),
    week: weekId,
    screens: z.array(ScreenSchema),
  })
  .superRefine((screens, ctx) => {
    const seen = new Set<string>()
    screens.screens.forEach(({ id }, i) => {
      if (seen.has(id))
        ctx.addIssue({
          code: "custom",
          path: ["screens", i, "id"],
          message: `${id} has two screens`,
        })
      seen.add(id)
    })
  })
export type Screens = z.infer<typeof ScreensSchema>

/** `value` read as a `screens.json`, or each problem with it. */
export function parseScreens(value: unknown): Parsed<Screens> {
  const parsed = ScreensSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "screens") }
}

/** The screen and region `ref` names, or null when none was captured. */
export function regionOf(
  screens: Screens,
  ref: RegionRef
): { readonly screen: Screen; readonly region: Region } | null {
  const name = parseRegionRef(ref)
  if (name === null) return null
  const screen = screens.screens.find((each) => each.id === name.ticket)
  const region = screen?.regions.find((each) => each.ref === ref)
  return screen && region ? { screen, region } : null
}

/** A box as the page measured it: a ref and where one element of it sits. */
export type Measured = { readonly ref: string; readonly box: Box }

/**
 * The regions of one screen from what the page measured: each ref once,
 * boxed around every element that carries it, in the order the page first
 * showed it. A ref that names no region, or an element with no size, is
 * left out.
 */
export function regionsOf(measured: ReadonlyArray<Measured>): Array<Region> {
  const boxes = new Map<string, Box>()
  for (const { ref, box } of measured) {
    if (parseRegionRef(ref) === null) continue
    if (box.width <= 0 || box.height <= 0) continue
    const had = boxes.get(ref)
    boxes.set(ref, had ? around(had, box) : box)
  }
  return [...boxes].map(([ref, box]) => ({ ref, box }))
}

function around(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

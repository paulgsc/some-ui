/**
 * Screens photographed for an essay, and the parts of each a scene can point
 * at, each named and boxed, so a scene can zoom to one (RR31, #3288; call
 * C790). Generic: a Rust essay photographs the phone's ticket cards from the
 * owner's week, and a cards essay (EXPLAIN, #2980) may photograph any screen
 * that marks its parts with `data-region`, on sample data for a viewer.
 *
 * A capture writes `screens.json` (`some-ui.screens/1`) beside the
 * pictures; this module is its one reading. www's `record:essay
 * --week-file` (`tests/record/screens.ts`) is the first capture.
 *
 * A region's name (`RegionRef`) is namespaced by its screen:
 * `<screen>:<name>`, the name one or more `:`-separated slugs. A screen's
 * regions all start with its id. Each kind of screen may give its names a
 * grammar of its own; the Rust Rounds card's is `parseRegionRef` and
 * `regionRef`, below.
 */

import { z } from "zod"

import type { Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"

export const SCREENS_SCHEMA = "some-ui.screens/1"

/** A slug: a screen's id, or one segment of a region's name. */
const SLUG = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}"

const SCREEN_ID = new RegExp(`^${SLUG}$`)

const ANY_REF = new RegExp(`^(${SLUG})((?::${SLUG})+)$`)

/** A region's name, `<screen>:<name>`: `QM-311:program`, `settings:theme-toggle`. */
export type RegionRef = string

/** The screen a region's name belongs to, or null when it is no region's name. */
export function screenOfRef(ref: string): string | null {
  return ANY_REF.exec(ref)?.[1] ?? null
}

// The Rust Rounds ticket card's names (RR31): a screen per ticket, its id
// the ticket's key, and these regions, in the essay's own keys:
//
// - `<TICKET>:question`: the ticket's title and spec;
// - `<TICKET>:point:<n>`: speak-to point n, from 1, in the essay's order;
// - `<TICKET>:program`: the program's code card;
// - `<TICKET>:run`: rustc's whole result;
// - `<TICKET>:diagnostic:<n>`: rustc's diagnostic n, from 1, in rustc's order.

/** A ticket's key, as the week writes it (`QM-311`). */
const TICKET = "[A-Z][A-Z0-9]{0,5}-\\d{1,6}"

/** What a region of a Rust Rounds ticket's card is. */
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

const RUST_REF = new RegExp(
  `^(${TICKET}):(question|program|run|(point|diagnostic):([1-9]\\d{0,2}))$`
)

/** A Rust Rounds card's region name read into its parts. */
export type RegionName = {
  readonly ticket: string
  readonly kind: RegionKind
  /** From 1, for a point or a diagnostic; null for the others. */
  readonly n: number | null
}

/** `ref` read as a Rust Rounds card's region, or null when it names none. */
export function parseRegionRef(ref: string): RegionName | null {
  const match = RUST_REF.exec(ref)
  if (!match) return null
  const [, ticket, whole, numbered, n] = match
  if (ticket === undefined || whole === undefined) return null
  const kind = REGION_KINDS.find((each) => each === (numbered ?? whole))
  if (kind === undefined) return null
  return { ticket, kind, n: n === undefined ? null : Number(n) }
}

/** The name of a region of a Rust Rounds `ticket`'s card. */
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
    (ref) => screenOfRef(ref) !== null,
    "a region is named <screen>:<name>, like QM-311:program"
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
    /** The screen's id, a slug; a Rust Rounds card's is its ticket's key. */
    id: z.string().regex(SCREEN_ID, "a screen's id is a slug"),
    /** The picture, beside `screens.json`. */
    file: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/, "a PNG beside the record"),
    /** The whole picture in CSS pixels: taller than the viewport when the screen scrolls. */
    width: px.positive(),
    height: px.positive(),
    /** Device pixels per CSS pixel. */
    scale: z.number().int().min(1).max(4),
    /** The window it was drawn in, in CSS pixels. */
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
      if (screenOfRef(ref) !== screen.id)
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
    /**
     * What the screens were drawn from, as a label: `{ kind: "rust-week",
     * id: "2026-w46" }` for the owner's week, `{ kind: "sample", id }` for
     * sample data.
     */
    source: z
      .strictObject({
        kind: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "a kind is a slug"),
        id: z.string().min(1),
      })
      .optional(),
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
  const id = screenOfRef(ref)
  if (id === null) return null
  const screen = screens.screens.find((each) => each.id === id)
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
    if (screenOfRef(ref) === null) continue
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

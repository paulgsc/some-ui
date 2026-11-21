/**
 * What real use shows of each module and each place in it (WALK5, #3337;
 * the owner's call C861): home's friction aggregate, read from the
 * engagement events (`@some-ui/engagement`'s places and visits) and handed
 * to a walkthrough's render as `friction.json`. A walkthrough says it for
 * each stop, said and burned in, and names the silent modules (#3338).
 *
 * Aggregates only, under the engagement report's public-safety rule (ask
 * #2701): every count is a `PublicCount`, "fewer than 5" below `UNDER`, and
 * nothing here names a pass reason, a chip, a company, a role or any
 * content. A module home doesn't measure the opening of is `not-measured`,
 * never silent.
 *
 * Home builds it (paulgsc/server, WALK5's step 2); this is the contract the
 * render reads, checked against `sample/friction.json` until home serves it.
 */

import { z } from "zod"

import type { Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"

export const FRICTION_SCHEMA = "some-ui.friction/1"

/** The days an aggregate looks back over: four weeks (C861). */
export const FRICTION_WINDOW_DAYS = 28

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** A count as it may go public (`PublicCount`, `./engagement-report`). */
const PublicCountSchema = z.union([
  z.int().min(5),
  z.literal("fewer-than-5"),
  z.literal("no-data"),
])

export const FrictionSchema = z.strictObject({
  schema: z.literal(FRICTION_SCHEMA),
  /** The owner's day it was read on. */
  asOf: z.iso.date(),
  windowDays: z.literal(FRICTION_WINDOW_DAYS),
  /** Each module the build offers, by its pipeline in the registry, once. */
  modules: z.array(
    z.strictObject({
      pipeline: id,
      opened: z.discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("measured"),
          /** Days of the window it was opened on. */
          days: PublicCountSchema,
          /** Whole weeks since it was last opened; null when home holds no open of it. */
          weeksQuiet: z.int().min(0).nullable(),
        }),
        z.strictObject({ kind: z.literal("not-measured") }),
      ]),
    })
  ),
  /** Each place a `left` can name (`places` in the registry), over the window. */
  places: z.array(
    z.strictObject({
      pipeline: id,
      affordance: id,
      place: id,
      /** Visits to it finished. */
      finished: PublicCountSchema,
      /** Visits to it left part-way. */
      leftPartWay: PublicCountSchema,
      /** The median time in it, in ms: shown only from 5 visits. */
      medianMs: PublicCountSchema,
    })
  ),
  /** Applying's debrief: the median friction the owner gave it, 1 to 5 (C861). */
  debrief: z.strictObject({
    medianFriction: z.union([
      z.number().min(1).max(5),
      z.literal("fewer-than-5"),
      z.literal("no-data"),
    ]),
  }),
})

export type Friction = z.infer<typeof FrictionSchema>

/** `raw` as a friction aggregate, or every reason it isn't one. */
export function parseFriction(raw: unknown): Parsed<Friction> {
  const parsed = FrictionSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "friction") }
  const problems: Array<string> = []
  const modules = new Set<string>()
  for (const m of parsed.data.modules) {
    if (modules.has(m.pipeline)) problems.push(`${m.pipeline}: listed twice`)
    modules.add(m.pipeline)
  }
  const places = new Set<string>()
  for (const p of parsed.data.places) {
    const key = `${p.pipeline}/${p.affordance}/${p.place}`
    if (places.has(key)) problems.push(`${key}: listed twice`)
    places.add(key)
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/**
 * Every template Studio lists (SFEED1, #2731): the newest pinned version of
 * each show's format, as `templates/<id>/v<n>.json` holds it. Each format is
 * made in code (the call's in `call.ts`, Playoff Delta's in
 * `@some-ui/playoff-delta`'s `show.ts`), and each one's test holds that code
 * equal to its pins. This module only reads the newest pin, so the phone,
 * whose build doesn't carry Playoff Delta's workspace, can show every
 * template's shape. The test of this module holds each entry to the newest
 * file in its folder, so a newly pinned version has to be listed here too.
 *
 * The release promo (HYPER3, #2726) joins once it is pinned.
 */

import type { Parsed } from "./cut-list"
import type { Format } from "./format"
import { parseFormat } from "./format"
import callSeries from "./sample/series/conference-call/v1.json"
import weekSeries from "./sample/series/playoff-delta-week/v2.json"
import { parseSeries } from "./series"
import { parseStoryboard } from "./storyboard"
import type { Storyboard } from "./storyboard"
import callBoard from "./templates/conference-call/storyboard.json"
import callV2 from "./templates/conference-call/v2.json"
import legendBoard from "./templates/playoff-delta-legend/storyboard.json"
import legendV2 from "./templates/playoff-delta-legend/v2.json"
import weekBoard from "./templates/playoff-delta-week/storyboard.json"
import weekV2 from "./templates/playoff-delta-week/v2.json"

/** The folder under `templates/` each template's versions are pinned in. */
export const TEMPLATE_IDS = [
  "conference-call",
  "playoff-delta-legend",
  "playoff-delta-week",
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

const NEWEST: Readonly<Record<TemplateId, unknown>> = {
  "conference-call": callV2,
  "playoff-delta-legend": legendV2,
  "playoff-delta-week": weekV2,
}

/** Whether `value` names a template Studio lists. */
export const isTemplateId = (value: unknown): value is TemplateId =>
  TEMPLATE_IDS.some((id) => id === value)

/** The newest version of template `id`, as it is pinned. */
export const templateFormat = (id: TemplateId): Format =>
  orThrow(id, parseFormat(NEWEST[id]))

function orThrow<T>(id: TemplateId, parsed: Parsed<T>): T {
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problems.join("; ")}`)
  return parsed.value
}

/**
 * The series each template's videos are drawn in, by its folder under
 * `sample/series/`, as home's recorders name it (www's `tests/record`):
 * Playoff Delta's legend is drawn in the week's.
 */
export const TEMPLATE_SERIES = {
  "conference-call": "conference-call",
  "playoff-delta-legend": "playoff-delta-week",
  "playoff-delta-week": "playoff-delta-week",
} as const satisfies Record<TemplateId, string>

const NEWEST_SERIES: Readonly<
  Record<(typeof TEMPLATE_SERIES)[TemplateId], unknown>
> = {
  "conference-call": callSeries,
  "playoff-delta-week": weekSeries,
}

/**
 * How template `id`'s videos are captioned (SFEED11, #2707): the `captions`
 * design its series' newest version names, a look of `@some-ui/burn-ins`, or
 * `null` when it names none, and the frame it is drawn in.
 */
export function templateCaptions(id: TemplateId): {
  readonly look: string | null
  readonly frame: { readonly width: number; readonly height: number }
} {
  const { designs, frame } = orThrow(
    id,
    parseSeries(NEWEST_SERIES[TEMPLATE_SERIES[id]])
  )
  return {
    look: designs.captions ?? null,
    frame: { width: frame.width, height: frame.height },
  }
}

/**
 * Each template's storyboard, pinned: made by its own code (the call's
 * `callStoryboard`, Playoff Delta's `storyboardFor`), which the phone's build
 * doesn't carry, and held to it by that code's test.
 */
const BOARDS: Readonly<Record<TemplateId, unknown>> = {
  "conference-call": callBoard,
  "playoff-delta-legend": legendBoard,
  "playoff-delta-week": weekBoard,
}

/** Every frame of an episode of template `id`, drawn from its sample before the fill (SFEED3). */
export const templateStoryboard = (id: TemplateId): Storyboard =>
  orThrow(id, parseStoryboard(BOARDS[id]))

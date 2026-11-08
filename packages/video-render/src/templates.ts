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

import type { Format } from "./format"
import { parseFormat } from "./format"
import callV2 from "./templates/conference-call/v2.json"
import legendV2 from "./templates/playoff-delta-legend/v2.json"
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
export function templateFormat(id: TemplateId): Format {
  const parsed = parseFormat(NEWEST[id])
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problems.join("; ")}`)
  return parsed.value
}

/**
 * The learner's takes of grammar-lens lines, on the phone (adaptive-learning
 * canon Rem. 4.16): a desk of takes (`lib/takes-desk`), at most forty, each
 * at most thirty seconds. They leave the phone only once the learner says a
 * study-context export carrying them arrived (`letGoLensTakes`).
 * Phone-only (`build.paths.ts`).
 */
import { takesDesk } from "@/lib/takes-desk"

import { LENS_TAKE_MAX_MS, LENS_TAKES_MAX } from "./budget"

export type { Take as LensTake } from "@/lib/takes-desk"

const desk = takesDesk({
  key: "some-ui:lens-takes",
  dbName: "some-ui.lens-takes",
  limits: { max: LENS_TAKES_MAX, maxMs: LENS_TAKE_MAX_MS },
})

export const phoneLensTakes = desk.phone
export const sweepLensTakes = desk.sweep
export const lensTakesForExport = desk.forExport
export const letGoLensTakes = desk.letGo

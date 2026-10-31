/**
 * The learner's takes of grammar-lens lines, on the phone (adaptive-learning
 * canon Rem. 4.16): a desk of takes (`lib/takes-desk`), an offline set of
 * forty, each at most thirty seconds, each going home as a voice note (HF5,
 * #2180). Phone-only (`build.paths.ts`).
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
/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const lensTakesDesk = desk

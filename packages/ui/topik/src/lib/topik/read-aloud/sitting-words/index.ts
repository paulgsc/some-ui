/**
 * Every word the sitting's repeats show: why a sentence is on screen again,
 * how much of the material the sitting has shown, and what it says once all
 * of it has been shown (adaptive-learning canon Rem. 4.9). Pure, and the one
 * place those words live, so they stay in the person's terms (what they did,
 * what was shown) and never the machinery's: no queue, deck, role or id
 * reaches the screen (`index.test.ts`).
 */

import { counted } from "@some-ui/core-utils"
import type { SentencePool } from "@topik/lib/topik/read-aloud/set-builder"
import type {
  EntryRole,
  IntroductionStep,
  RepStep,
} from "@topik/lib/topik/read-aloud/set-machine"

/** A return: the learner marked it stuck, and it comes back in this set. */
const BACK = "Back: you marked it stuck"

/** "Say it again": the line read a second time on purpose. */
const SECOND_READ = "Second read"

/**
 * Why the item on screen is here again, in a line beside the step's label,
 * or null when it is not here again. A return says so at every step; an item
 * at its echo is on its second read whatever else.
 */
export function reasonOf(
  role: EntryRole,
  step: RepStep | IntroductionStep | "paused"
): string | null {
  if (step === "paused" || role === "introduction") return null
  if (role === "return") return BACK
  return step === "echo" ? SECOND_READ : null
}

/** The pool bar's spoken name. */
export const POOL_BAR_LABEL = "Different sentences shown this sitting"

/** The count on the set summary: how much of the material has been shown. */
export const poolCount = ({ shown, of }: SentencePool): string =>
  `${shown} of ${counted(of, "sentence")} shown this sitting`

/** Whether every sentence has been shown this sitting, and there are some. */
export const poolFull = ({ shown, of }: SentencePool): boolean =>
  of > 0 && shown >= of

/** What the set summary says once every sentence has been shown. */
export const poolFullNote = ({ of }: SentencePool): string =>
  of === 1
    ? "That's the only sentence there is, so from here it comes back."
    : `That's all ${of} sentences, once each this sitting. From here they come back, the ones I showed longest ago first.`

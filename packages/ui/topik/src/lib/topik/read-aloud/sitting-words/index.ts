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

const BACK = "Back: you marked it stuck"
const SECOND_READ = "Second read"

/**
 * Why the item on screen is here again, in a line beside the step's label,
 * or null when it is not here again. A return outranks the echo.
 */
export function reasonOf(
  role: EntryRole,
  step: RepStep | IntroductionStep | "paused"
): string | null {
  if (step === "paused") return null
  if (role === "return") return BACK
  return step === "echo" ? SECOND_READ : null
}

export const POOL_BAR_LABEL = "Different sentences shown this sitting"

export const poolCount = ({ shown, of }: SentencePool): string =>
  `${shown} of ${counted(of, "sentence")} shown this sitting`

export const poolFull = ({ shown, of }: SentencePool): boolean =>
  of > 0 && shown >= of

export const poolFullNote = ({ of }: SentencePool): string =>
  of === 1
    ? "That's the only sentence there is, so from here it comes back."
    : `You've seen all ${of} sentences this sitting. From here they come back, the ones I showed longest ago first.`

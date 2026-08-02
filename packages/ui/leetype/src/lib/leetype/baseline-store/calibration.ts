import type { Step } from "@leetype/types/exercise"

import { CALIBRATION_CHARS } from "."

/**
 * The warm-up: a language-agnostic passage the player types once, so every
 * threshold after it is a function of their own speed rather than of a
 * number somebody picked.
 *
 * # Why it is agnostic
 *
 * The baseline is a *copying* speed. It has to be measured on text the
 * player has nothing to retrieve — no idioms to recall, no API to remember,
 * nothing masked. If the warm-up were Rust, a Rust programmer and a
 * JavaScript programmer would get different baselines for the same hands,
 * and every threshold derived from it would inherit that error.
 *
 * So: prose, in plain words, with ordinary punctuation and no code at all.
 * It reads as an instruction, which is also what it is.
 *
 * # Why it is a step and not a screen
 *
 * Mechanically this is the existing typing surface with the new features
 * switched off: no masking, no gate, no prompt beyond one line. It reuses
 * `ExerciseCard`, and the "switched off" part costs nothing — the renderer
 * draws the visibility map it is handed, so handing it an all-revealed map
 * *is* the off switch. Nothing in the engine needed a mode flag.
 */
const PASSAGE = [
  "Type this the way you normally type.",
  "There is nothing hidden here and nothing to work out.",
  "The game is only watching how fast your hands move over text you can see,",
  "so that everything it asks of you afterwards is measured against you",
  "and not against somebody else.",
].join("\n")

/**
 * The warm-up as a `Step`, so it renders through the same card as everything
 * else.
 *
 * It is deliberately not part of any `Exercise`: it proves no competency, it
 * is not gated, and a runner that sequenced it would have to learn what a
 * warm-up is. The host shows it, takes the sample, and moves on.
 */
export const CALIBRATION_STEP: Step = {
  id: "calibration",
  goal: "Warm up — type this at whatever speed is comfortable.",
  concepts: [],
  blocks: [
    {
      kind: "prompt",
      lines: [
        "Nothing is masked and nothing is scored. This is how the game learns your speed.",
      ],
    },
    { kind: "typing", source: PASSAGE, language: "typescript" },
  ],
}

/**
 * Sanity check on the passage's size, run once at module load rather than in
 * a test: `CALIBRATION_CHARS` states how much evidence a sample should carry,
 * and a passage that quietly drifted below it would produce a baseline the
 * store then treats as authoritative.
 */
if (PASSAGE.replace(/\s/g, "").length < CALIBRATION_CHARS) {
  throw new Error(
    `The calibration passage carries fewer than ${CALIBRATION_CHARS} typeable characters, ` +
      "which is less evidence than the baseline store is documented to want."
  )
}

/**
 * The tree prompt's worked example, as tests use it: the one tree the prompt
 * tells every model to copy, so a fixture built from it moves with the
 * prompt. A level-2 tree whose route `b` runs root, choice, consequence,
 * repair and leaf, and whose other routes end at a leaf a choice below the
 * root. Test-only.
 */

import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import TREE_PROMPT from "@topik/lib/topik/generation/tree-prompt.md?raw"

/** The example's JSON, as the prompt prints it. */
export function workedExample(): string {
  const section = TREE_PROMPT.slice(TREE_PROMPT.indexOf("## Worked example"))
  const open = section.indexOf("```json\n") + "```json\n".length
  return section.slice(open, section.indexOf("```", open))
}

/** The example as a model's reply: prose around one fenced block. */
export const fenced = (value: unknown): string =>
  `Here it is.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`

/** The example through both audits, as the handheld plays it. */
export function workedLesson(): DramaLesson {
  const intake = intakeTree(workedExample())
  if (intake.status !== "checked") throw new Error(JSON.stringify(intake))
  return intake.lesson
}

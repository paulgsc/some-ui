import type { ReadBlock } from "@leetype/types/exercise"
import { assertNever } from "some-ui-utils"

/**
 * One atomic, paginable unit of evidence — the granularity `useFittedPage`
 * pages over. Deliberately not "one block, one row": a `trace` block's
 * headline and each of its observations are separate rows, the same way a
 * multi-line `prompt` block already contributed one row per line, because
 * that is the granularity the doctrine actually cares about ("if a
 * diagnostic observation needs pages, it is not granular enough" reads
 * per-observation, not per-block).
 */
export type EvidenceRow =
  | { kind: "prompt-line"; id: string; text: string }
  | {
      kind: "transition"
      id: string
      label: string | undefined
      before: string
      after: string
    }
  | { kind: "trace-headline"; id: string; text: string }
  | { kind: "trace-observation"; id: string; label: string; value: string }
  | { kind: "region"; id: string; label: string }

/**
 * Flattens a step's read blocks into the rows `PromptPanel` pages over.
 *
 * Pure and DOM-free on purpose: it is the one piece of the panel's
 * rendering logic worth sharing with the corpus lint (`./corpus-lint.test.ts`
 * — see `EVIDENCE_ROW_BUDGET` below), and a lint that has to mount React to
 * count rows is a lint nobody runs.
 */
export function evidenceRowsOf(
  blocks: ReadonlyArray<ReadBlock>
): Array<EvidenceRow> {
  const rows: Array<EvidenceRow> = []

  blocks.forEach((block, blockIndex) => {
    switch (block.kind) {
      case "prompt": {
        block.lines.forEach((text, lineIndex) => {
          rows.push({
            kind: "prompt-line",
            id: `${blockIndex}-${lineIndex}`,
            text,
          })
        })
        break
      }
      case "transition": {
        rows.push({
          kind: "transition",
          id: `${blockIndex}`,
          label: block.label,
          before: block.before,
          after: block.after,
        })
        break
      }
      case "trace": {
        if (block.headline !== undefined) {
          rows.push({
            kind: "trace-headline",
            id: `${blockIndex}-headline`,
            text: block.headline,
          })
        }
        block.observations.forEach((observation, observationIndex) => {
          rows.push({
            kind: "trace-observation",
            id: `${blockIndex}-${observationIndex}`,
            label: observation.label,
            value: observation.value,
          })
        })
        break
      }
      case "region": {
        rows.push({ kind: "region", id: `${blockIndex}`, label: block.label })
        break
      }
      default: {
        return assertNever(block)
      }
    }
  })

  return rows
}

/**
 * The row budget a step's evidence is allowed to occupy — the structural
 * half of "the pagination path is unreachable from a valid corpus".
 *
 * Not a physical proof: `useFittedPage` measures a real box, and no static
 * count can substitute for that (see its own doc comment on why a fixed
 * page size is always wrong for *some* viewport). What this bounds is
 * authoring, the same way `PROMPT_MAX_LINES` does — comfortably under
 * `useFittedPage`'s own `maxPerPage: 8` so a step that respects it clears
 * pagination on any box the panel is realistically given, and the corpus
 * lint (`./corpus-lint.test.ts`) fails loudly on any step that does not.
 */
export const EVIDENCE_ROW_BUDGET = 6

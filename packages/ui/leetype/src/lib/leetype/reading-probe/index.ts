import type { DiffHunk, RenderedDiffLineKind } from "@leetype/types/exercise"
import { renderedDiffLineKinds } from "@leetype/types/exercise"

/**
 * What the phone's round cards share (LTY-MOBILE): the row model `DiffCard`
 * paints a hunk with, and how many options a card offers.
 *
 * Engine-free on purpose: no `types/leetype`, wasm loader or hook, so the
 * phone surface mounts without fetching `@some-ui/leetype-wasm`.
 *
 * Named for the reading surface that first used it, which rounds replaced on
 * the phone; the claim-discrimination half of this module went with it.
 */

/**
 * One rendered line of a hunk, ready to paint. Derived from the same
 * segments as the engine-facing `source`, so the phone card and the desktop
 * code view cannot disagree. `oldLine`/`newLine` follow the two-column diff
 * convention (`add` has only a new line, `del` only an old one).
 */
type ReadingRow = {
  /** Position in the hunk, and the row's React key. */
  index: number
  kind: RenderedDiffLineKind
  /** The line's text, `‹…›` context delimiters already stripped. */
  text: string
  /** Absent on an `add` row, which has no line in the old file. */
  oldLine?: number
  /** Absent on a `del` row, which has no line in the new file. */
  newLine?: number
}

/** A hunk, as the phone's `DiffCard` draws it. */
export type ReadingHunk = {
  /** From `diff.path`. Absent when the step carries no diff overlay. */
  path?: string
  language: string
  rows: ReadonlyArray<ReadingRow>
}

/**
 * A Def. 1.4 hunk as the phone card draws it. A round's `D` members are bare
 * hunks with no step around them, so the round surface reaches `DiffCard`
 * through this.
 */
export function readingHunkOfDiff(
  diff: DiffHunk,
  language: string
): ReadingHunk {
  const text = diff.segments.map((segment) => segment.text).join("")
  const kinds = renderedDiffLineKinds(diff)

  let oldLine = diff.oldStart
  let newLine = diff.newStart

  const rows = text.split("\n").map((line, index): ReadingRow => {
    // A short `kinds` renders its tail as context, as `CodeDisplay` does.
    const kind: RenderedDiffLineKind = kinds[index] ?? "context"
    const showOld = kind !== "add"
    const showNew = kind !== "del"
    const row: ReadingRow = {
      index,
      kind,
      text: line,
      ...(showOld ? { oldLine } : {}),
      ...(showNew ? { newLine } : {}),
    }
    if (showOld) oldLine += 1
    if (showNew) newLine += 1
    return row
  })

  return { path: diff.path, language, rows }
}

/**
 * How many options a card offers, including the answer. Four fits above the
 * fold beside a hunk at 390px; three would make a lucky guess a third of the
 * time. A small pool yields fewer options, never repeated or invented ones.
 */
export const READING_OPTION_COUNT = 4

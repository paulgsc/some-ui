import type { SourceCode } from "eslint"
import type * as ESTree from "estree"

/**
 * Whether a comment in the unbroken run of `//` lines directly above `line`
 * (each alone on its line) passes `test`. The lookup over the file's line
 * comments is built on first use and shared by every call.
 */
export function commentBlockAbove(
  sourceCode: SourceCode
): (line: number, test: (comment: ESTree.Comment) => boolean) => boolean {
  let alone: Map<number, ESTree.Comment> | null = null
  return (line, test) => {
    if (alone === null) {
      alone = new Map()
      for (const comment of sourceCode.getAllComments()) {
        if (comment.type !== "Line" || !comment.loc) continue
        const at = comment.loc.start.line
        const text = sourceCode.lines[at - 1] ?? ""
        if (text.trimStart().startsWith("//")) alone.set(at, comment)
      }
    }
    for (
      let at = line - 1, above = alone.get(at);
      above;
      at -= 1, above = alone.get(at)
    ) {
      if (test(above)) return true
    }
    return false
  }
}

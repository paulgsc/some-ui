/**
 * What a take home couldn't hear was said for, where the owner can go back
 * to it, read it again and record it again (#3339): a spoken card's part, an
 * interview week's question, or a card it reads aloud. Read from what home
 * was told of the take (`of`, `ref`), which the phone named when it sent it.
 * Any other take (a game's bite, a reflection, one recorded on Takes) has no
 * page to say it again from, so none. Pure; the words are `./words`', and
 * the build links each kind to its page.
 */
import { spokenPartOfLine } from "@some-ui/video-render"

/** A page a take can be said again from. */
export type TakeSource =
  /** Part `part` (from 0) of spoken card `card`. */
  | { readonly kind: "spoken"; readonly card: string; readonly part: number }
  /** An interview week's question, by its id. */
  | { readonly kind: "question"; readonly question: string }
  /** An interview week's card read aloud, by its id. */
  | { readonly kind: "read"; readonly card: string }

/** What an interview take's ref names after its week: a read is `read:<card>`. */
const READ = "read:"

/** Where `take` can be said again from; null for none. */
export function sourceOf(take: {
  readonly of: string
  readonly ref: string
}): TakeSource | null {
  if (take.of === "studio") {
    const spoken = spokenPartOfLine(take.ref)
    return spoken === null ? null : { kind: "spoken", ...spoken }
  }
  if (take.of === "interview") {
    // `<week>:<question>`, or `<week>:read:<card>` (www's interview spec).
    const at = take.ref.indexOf(":")
    const item = at === -1 ? "" : take.ref.slice(at + 1)
    if (item.startsWith(READ)) {
      const card = item.slice(READ.length)
      return card === "" ? null : { kind: "read", card }
    }
    return item === "" || item.includes(":")
      ? null
      : { kind: "question", question: item }
  }
  return null
}

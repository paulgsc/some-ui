/**
 * Where a candidate differs from the utterance it is judged against.
 *
 * A morphism probe keeps an utterance's content words and varies the
 * structure a relation acts on (adaptive-learning canon Prop. 4.2): 예뻐요
 * against 예뻤어요, 안 예뻐요, 예쁘세요. The teaching audit measures how much
 * of an odd-one-out's source a candidate keeps, and warns when it rewrites
 * more than its relation would (`core/tree-audit`).
 *
 * The unit is the Hangul syllable - one code point per syllable block - which
 * is fine enough to see 뻐 -> 뻤어 and coarse enough to stay cheap.
 */

import { lcsTable } from "@some-ui/core-utils"

type DiffSegment = {
  text: string
  kind: "same" | "added" | "removed"
}

export type UtteranceDiff = {
  segments: Array<DiffSegment>
  /** 0..1: shared syllables over total, whitespace aside. */
  similarity: number
}

/** Beyond this a probe's utterance is prose, not a sentence to diff. */
const MAX_DIFF_LENGTH = 160

/**
 * Below this two utterances are different sentences - a reply, a paraphrase in
 * other words - rather than one sentence transformed.
 */
export const MIN_DIFF_SIMILARITY = 0.45

function push(
  segments: Array<DiffSegment>,
  kind: DiffSegment["kind"],
  text: string
): void {
  const last = segments[segments.length - 1]
  if (last?.kind === kind) last.text += text
  else segments.push({ kind, text })
}

export function diffUtterance(
  source: string,
  candidate: string
): UtteranceDiff {
  const a = Array.from(source)
  const b = Array.from(candidate)
  if (a.length > MAX_DIFF_LENGTH || b.length > MAX_DIFF_LENGTH) {
    return { segments: [{ kind: "same", text: candidate }], similarity: 0 }
  }

  const table = lcsTable(a, b)
  const segments: Array<DiffSegment> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(segments, "same", b[j] ?? "")
      i += 1
      j += 1
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      push(segments, "removed", a[i] ?? "")
      i += 1
    } else {
      push(segments, "added", b[j] ?? "")
      j += 1
    }
  }
  for (; i < a.length; i += 1) push(segments, "removed", a[i] ?? "")
  for (; j < b.length; j += 1) push(segments, "added", b[j] ?? "")

  const visible = (chars: Array<string>): number =>
    chars.filter((char) => char.trim() !== "").length
  const shared = segments
    .filter((segment) => segment.kind === "same")
    .reduce((sum, segment) => sum + visible(Array.from(segment.text)), 0)
  const total = visible(a) + visible(b)

  return { segments, similarity: total === 0 ? 1 : (2 * shared) / total }
}

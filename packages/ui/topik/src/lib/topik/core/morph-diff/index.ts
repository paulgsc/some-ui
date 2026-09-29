/**
 * Where a candidate differs from the utterance it is judged against.
 *
 * A morphism probe keeps an utterance's content words and varies the
 * structure a relation acts on (adaptive-learning canon Prop. 4.2): 예뻐요
 * against 예뻤어요, 안 예뻐요, 예쁘세요. Highlighting the difference points the
 * learner at *where* the relation acts without saying *whether* it holds, so it
 * is a rendering of the item rather than a hint on its outcome (Cor. 4.5 (i)).
 *
 * The unit is the Hangul syllable - one code point per syllable block - which
 * is fine enough to show 뻐 -> 뻤어 and coarse enough to read at a glance.
 */

export type DiffSegment = {
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
 * other words - and highlighting "everything changed" says nothing.
 */
export const MIN_DIFF_SIMILARITY = 0.45

function lcsTable(a: Array<string>, b: Array<string>): Array<Array<number>> {
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] ?? []
    const below = table[i + 1] ?? []
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  return table
}

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

/** The diff worth showing for a candidate, or null when it would mislead. */
export function highlightFor(
  source: string,
  candidate: string
): Array<DiffSegment> | null {
  if (source.trim() === "" || source === candidate) return null
  const diff = diffUtterance(source, candidate)
  return diff.similarity >= MIN_DIFF_SIMILARITY ? diff.segments : null
}

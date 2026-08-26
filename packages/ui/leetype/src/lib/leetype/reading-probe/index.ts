import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import type { RenderedDiffLineKind, Step } from "@leetype/types/exercise"
import { renderedDiffLineKinds, typingBlockOf } from "@leetype/types/exercise"

/**
 * The mobile path's whole derivation layer (LTY-MOBILE), and the only place
 * in this package that reads a step in order to ask a question about it
 * rather than to have it typed.
 *
 * # Engine-free, on purpose
 *
 * Nothing here imports `types/leetype`, the wasm loader, or any hook. A
 * reading probe is a pure function of authored corpus data, which is what
 * makes the mobile surface mountable without `@some-ui/leetype-wasm` ever
 * being fetched — see `components/reading-game/reading-session`. The desktop
 * path's boundary ("the typing engine must never know why a snippet exists")
 * holds here in the mirror image: the reading path never learns what a slot,
 * a caret or a WPM figure is.
 *
 * # What a probe is, and what it deliberately is not
 *
 * Desktop probes **production**: the player produces the witness by typing
 * it, and fluency under a masking loop is the evidence. A phone cannot carry
 * that channel — a code keyboard on a 390px viewport is an obstacle, not an
 * input modality — so the small-screen surface switches the probe to
 * **discrimination**: the same hunk, the same authored evidence, and the
 * player picks the claim the change actually makes out of a set of claims
 * the corpus makes about other changes.
 *
 * Discrimination is a strictly weaker signal than production and this module
 * makes no attempt to pretend otherwise. Nothing it returns is read by
 * `weightedWpm`, `gateThreshold`, `progression()`, the baseline store, or any
 * persisted anything — the same `p_credited = false` posture LTY-SEAM already
 * holds for the whole exercise (#1015), inherited rather than re-argued.
 */

/**
 * One rendered line of a step's hunk, ready to paint.
 *
 * Derived, never authored: `kind` comes from `renderedDiffLineKinds` and the
 * text from the same segments that generate the engine-facing `source`, so a
 * mobile row and a desktop row can no more disagree about a line than
 * `source` and `lineKinds` can (`types/exercise.ts`, LTY-PATCH).
 *
 * `oldLine`/`newLine` follow the ordinary two-column diff convention — an
 * `add` row occupies the new column only, a `del` row the old column only —
 * computed here rather than in the component because it is arithmetic over
 * `kind`, not a rendering decision, and `CodeDisplay` already computes the
 * identical thing for the desktop gutter.
 */
export type ReadingRow = {
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

/** A step's code, as the mobile card draws it. */
export type ReadingHunk = {
  /** From `diff.path`. Absent when the step carries no diff overlay. */
  path?: string
  language: string
  rows: ReadonlyArray<ReadingRow>
}

/**
 * Strips LTY-FRAME's `‹…›` context-span delimiters.
 *
 * Duplicated from `exercises/corpus-lint.ts`'s private helper of the same
 * name rather than shared, and it is worth saying why: that one is a lint's
 * approximation of the engine's `typed_stream` and its known gaps (an
 * unmatched `‹`, documented at length in `exercises/totality.ts`) are gaps in
 * a *check*. This one is a renderer's, and the two would drift apart the
 * moment either grew a case for its own purpose. Both are three lines.
 */
function withoutContextDelimiters(source: string): string {
  return source.replace(/[‹›]/g, "")
}

/**
 * The rows a step's typing block renders as on the reading surface.
 *
 * Total for every step the schema admits, including one with no `diff`
 * overlay: without a hunk there is nothing marked added or removed, so every
 * line is `context` and the card degrades into a plain code card with a
 * language chip and no sign column entries. That is the honest rendering —
 * the step genuinely has no delta to point at — and it keeps the reading
 * surface playable across the whole corpus rather than only the
 * patch-shaped part of it.
 */
export function readingHunkOf(step: Step): ReadingHunk | null {
  const typing = typingBlockOf(step)
  if (typing === undefined) return null

  const diff = typing.diff
  const text = diff
    ? diff.segments.map((segment) => segment.text).join("")
    : withoutContextDelimiters(typing.source)
  const kinds: ReadonlyArray<RenderedDiffLineKind> = diff
    ? renderedDiffLineKinds(diff)
    : []

  let oldLine = diff?.oldStart ?? 1
  let newLine = diff?.newStart ?? 1

  const rows = text.split("\n").map((line, index): ReadingRow => {
    // A `lineKinds` shorter than the rendered line count is legal (LTY-PATCH
    // P2) — the tail renders as unmarked context, total rather than throwing,
    // exactly as `CodeDisplay` treats it.
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

  return {
    ...(diff ? { path: diff.path } : {}),
    language: typing.language,
    rows,
  }
}

/**
 * The two step families, as a question the learner can actually be asked.
 *
 * A diagnostic step's authored `rationale.cause` is a claim about what was
 * wrong; a construction step's `obligation` is a claim about what the change
 * establishes. They are different sentences answering different questions, so
 * the probe carries the question with the claim rather than wording one
 * prompt vaguely enough to cover both.
 */
export type ReadingFamily = "diagnostic" | "construction" | "goal"

const FAMILY_PROMPT: Record<ReadingFamily, string> = {
  diagnostic: "What fault does this change repair?",
  construction: "What does this change establish?",
  goal: "What is this change for?",
}

/** One authored sentence about one step, and where it came from. */
export type Claim = {
  /** The step the sentence was authored on — the identity distractor selection dedupes by. */
  stepId: string
  family: ReadingFamily
  text: string
  /**
   * The originating step's `concepts`, carried along because distractor
   * selection prefers a claim that shares one (see `readingProbeOf`). A bag
   * of strings nothing branches on beyond that set intersection — the same
   * posture `concepts` holds everywhere else in this package.
   */
  concepts: ReadonlyArray<string>
  /**
   * Why this claim and not a weaker one, when the corpus authored it.
   * Diagnostic steps carry `rationale.whyRepairDiscriminates`, which is
   * already exactly this sentence; nothing else does yet.
   */
  justification?: string
}

/**
 * The one sentence a step asserts about its own change.
 *
 * Total by construction: `rationale.cause` if the step has one,
 * `obligation` if it has that, and otherwise `goal`, which the schema
 * requires of every step. A corpus can therefore never produce a step the
 * reading surface has no question for — which matters, because the mobile
 * path is the *only* path on a phone and a step it could not pose would be a
 * dead end rather than a degraded one.
 *
 * # This renders `rationale` and `obligation`, which the desktop path may not
 *
 * `docs/leetype/README.md` records both as authoring metadata "never rendered
 * to the learner," and on the production path that is exactly right: an
 * obligation shown above a blank is the description card the whole M20 shift
 * retired, handing the player the answer to the thing they were about to
 * type. The reading path inverts the situation — here the claim *is* the
 * answer, offered inside a closed set alongside claims the corpus makes about
 * other changes, and discriminating it is the entire task. An answer key
 * among distractors is the format, not a leak.
 *
 * That distinction is a real amendment, not a loophole, and it is recorded as
 * one under LTY-MOBILE in `docs/leetype/README.md`. The bound it comes with:
 * a claim may be rendered **only** as one option among others, never on its
 * own and never before a choice is made. `claim-choices` is the one component
 * entitled to draw one, and `reading-feedback` the one entitled to say which.
 */
export function claimOf(step: Step): Claim {
  if (step.rationale !== undefined) {
    return {
      stepId: step.id,
      family: "diagnostic",
      text: step.rationale.cause,
      concepts: step.concepts,
      justification: step.rationale.whyRepairDiscriminates,
    }
  }
  if (step.obligation !== undefined) {
    return {
      stepId: step.id,
      family: "construction",
      text: step.obligation,
      concepts: step.concepts,
    }
  }
  return {
    stepId: step.id,
    family: "goal",
    text: step.goal,
    concepts: step.concepts,
  }
}

/** One option on the card. `id` is stable across a step so selection can key off it. */
export type ReadingOption = {
  id: string
  text: string
}

/**
 * A step, posed.
 *
 * `answerId` is knowable without a semantic verifier — it is exact identity
 * with the step's own authored claim — which is what separates this from
 * LTY-WHY's typed rationale, where a verdict would have been a judgement with
 * no justification behind it. Here the judgement is "you picked the sentence
 * this step's author wrote about this step," and `justification` is the
 * author's own reason for it. The repository's rule (*no judgment is allowed
 * unless it can produce its own justification*) is satisfied literally rather
 * than by exemption.
 */
export type ReadingProbe = {
  stepId: string
  /**
   * Which authored field the answer came from. Read by `ReadingSession` for
   * exactly one thing: a `"goal"` probe's answer is the step's own goal, so
   * the card must not also print that goal as its title — the title would be
   * the answer, sitting above four options one of which repeats it verbatim.
   */
  family: ReadingFamily
  prompt: string
  options: ReadonlyArray<ReadingOption>
  answerId: string
  justification?: string
}

/**
 * How many options a card offers, including the answer.
 *
 * Four because that is what fits above the fold on a 390px viewport beside a
 * hunk without either becoming a scroll destination, and because three makes
 * a lucky guess a third of the time. A corpus too small to supply three
 * distractors yields fewer options rather than repeated or invented ones —
 * see `readingProbeOf`.
 */
export const READING_OPTION_COUNT = 4

/**
 * Builds one card's question from the step, a pool of claims, and a seed.
 *
 * # Where distractors come from, and why not from an authored field
 *
 * They are other steps' own claims. Not authored per-step distractor lists,
 * which would leave the surface unreachable on every one of the corpus's
 * existing steps until someone wrote three plausible wrong answers for each,
 * and would age into strawmen the moment the author's attention moved on.
 * A claim drawn from the corpus is a sentence somebody meant, about a change
 * somebody made — the strongest kind of distractor there is, and it arrives
 * free with every exercise added afterwards.
 *
 * The judgement this performs is small enough to state completely, which is
 * the bar this package holds itself to: *a distractor is another step's
 * authored claim, preferring one that shares a `concepts` entry with this
 * step, ordered by seed.* The concept preference is what makes the choice a
 * near miss rather than a category error — a `HashMap` entry-API claim beside
 * a divide-by-zero hunk is eliminable without reading the code, and a probe
 * you can pass without reading the code probes nothing.
 *
 * # Determinism
 *
 * Same step, same pool, same seed → same options in the same order, so a
 * story, a test, and a replayed bug report all show one screen. `seed` is the
 * session seed mixed with the step's position; the caller owns that mixing.
 */
export function readingProbeOf(
  step: Step,
  pool: ReadonlyArray<Claim>,
  seed: number,
  optionCount: number = READING_OPTION_COUNT
): ReadingProbe {
  const answer = claimOf(step)
  const concepts = new Set(step.concepts)

  const candidates = pool.filter(
    (claim) => claim.stepId !== step.id && claim.text !== answer.text
  )
  // Deduplicated by text: two steps in the corpus are allowed to make the
  // same claim (a transferFrom pairing is exactly that), and the same
  // sentence twice on one card reads as a bug rather than as a choice.
  const seen = new Set<string>()
  const unique = candidates.filter((claim) => {
    if (seen.has(claim.text)) return false
    seen.add(claim.text)
    return true
  })

  const sharesConcept = (claim: Claim): boolean =>
    claim.concepts.some((concept) => concepts.has(concept))

  /**
   * Ranks a distractor: same family first, then shared concept.
   *
   * **Family before concept, and the order matters.** The three families are
   * authored in visibly different registers — a `cause` is a lowercase
   * subordinate clause ("the loop body never mutates cursor, so …"), an
   * `obligation` is a lowercase claim ("a lookup can be held as a place"), a
   * `goal` is a sentence-cased imperative ending in a period ("Bring HashMap
   * into scope."). Mixing them puts a typographic tell on the card: the odd
   * one out is spottable without reading a line of the code, and a probe you
   * can pass without reading the code probes nothing. Matching the register
   * removes the tell, and the concept preference — the near-miss rule — then
   * does its work inside a set that all looks alike.
   */
  const rank = (claim: Claim): number =>
    (claim.family === answer.family ? 0 : 2) + (sharesConcept(claim) ? 0 : 1)

  // Shuffled first, then ordered by rank: a stable sort keeps the seeded
  // permutation as the tie-break inside each rank, so two equally good
  // distractors are still chosen by seed rather than by corpus order.
  const distractors = shuffledBySeed(unique, seed)
    .map((claim, index) => ({ claim, index }))
    .sort((a, b) => rank(a.claim) - rank(b.claim) || a.index - b.index)
    .slice(0, Math.max(optionCount - 1, 0))
    .map((entry) => entry.claim)

  const options = shuffledBySeed(
    [answer, ...distractors].map(
      (claim): ReadingOption => ({ id: claim.stepId, text: claim.text })
    ),
    seed ^ 0x27d4eb2f
  )

  return {
    stepId: step.id,
    family: answer.family,
    prompt: FAMILY_PROMPT[answer.family],
    options,
    answerId: answer.stepId,
    ...(answer.justification !== undefined
      ? { justification: answer.justification }
      : {}),
  }
}

/**
 * Every claim a set of steps makes, in order — the pool `readingProbeOf`
 * draws distractors from.
 *
 * Callers hand it the whole eligible corpus rather than one exercise: an
 * exercise is three or four steps about one concept, so distractors drawn
 * from within it would be so close as to be arbitrary, and there would
 * rarely be three of them.
 */
export function claimPoolOf(steps: ReadonlyArray<Step>): ReadonlyArray<Claim> {
  return steps.map(claimOf)
}

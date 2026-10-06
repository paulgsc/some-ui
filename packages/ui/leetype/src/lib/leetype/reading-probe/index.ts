import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import type {
  DiffHunk,
  RenderedDiffLineKind,
  Step,
} from "@leetype/types/exercise"
import { renderedDiffLineKinds, typingBlockOf } from "@leetype/types/exercise"

/**
 * The mobile path's derivation layer (LTY-MOBILE): the only place that reads
 * a step to ask a question about it rather than to have it typed.
 *
 * Engine-free on purpose: no `types/leetype`, wasm loader or hook, so the
 * mobile surface mounts without fetching `@some-ui/leetype-wasm`. The
 * reading path never learns what a slot, caret or WPM figure is.
 *
 * Desktop probes **production** (typing the witness). A phone cannot carry
 * that channel, so the small screen probes **discrimination**: the same hunk
 * and evidence, and the player picks the claim this change makes from claims
 * the corpus makes about other changes. That is a weaker signal, and nothing
 * here feeds `weightedWpm`, `gateThreshold`, `progression()`, the baseline
 * store or any persistence (`p_credited = false`, as LTY-SEAM).
 */

/**
 * One rendered line of a step's hunk, ready to paint. Derived from the same
 * segments as the engine-facing `source`, so mobile and desktop rows cannot
 * disagree. `oldLine`/`newLine` follow the two-column diff convention (`add`
 * has only a new line, `del` only an old one).
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
 * Strips LTY-FRAME's `‹…›` context-span delimiters. Deliberately not shared
 * with corpus-lint's similar helper: that one approximates the engine for a
 * check, this one renders, and they would drift apart for their own reasons.
 */
function withoutContextDelimiters(source: string): string {
  return source.replace(/[‹›]/g, "")
}

/**
 * The rows a step's typing block renders as on the reading surface. Total:
 * a step without a `diff` renders every line as `context`, a plain code
 * card, so the whole corpus stays playable.
 */
export function readingHunkOf(step: Step): ReadingHunk | null {
  const typing = typingBlockOf(step)
  if (typing === undefined) return null
  if (typing.diff) return readingHunkOfDiff(typing.diff, typing.language)
  return {
    language: typing.language,
    rows: withoutContextDelimiters(typing.source)
      .split("\n")
      .map(
        (line, index): ReadingRow => ({
          index,
          kind: "context",
          text: line,
          oldLine: index + 1,
          newLine: index + 1,
        })
      ),
  }
}

/**
 * A Def. 1.4 hunk as the mobile card draws it: the same rows
 * `readingHunkOf` derives for a step's diff overlay. A round's `D` members
 * are bare hunks with no step around them, so the round surface reaches
 * `DiffCard` through this.
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
 * Which authored field a claim came from, as a question the learner can be
 * asked: `rationale.cause` says what was wrong, `obligation` what the change
 * establishes, `goal` what it is for. Each gets its own prompt.
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
  /** The originating step's `concepts`; distractor selection prefers a shared one. */
  concepts: ReadonlyArray<string>
  /** Why this claim and not a weaker one: `rationale.whyRepairDiscriminates`, when present. */
  justification?: string
}

/**
 * The one sentence a step asserts about its own change.
 *
 * Total: `rationale.cause`, else `obligation`, else the required `goal`. On
 * a phone the reading path is the session (Prop. 9.2), so a step it could
 * not pose would be a dead end.
 *
 * This renders `rationale` and `obligation`, which the typing path never
 * may: there, a claim above a blank hands over the answer. Here the claim
 * *is* the answer inside a closed set of other steps' claims, and
 * discriminating it is the task. Recorded under LTY-MOBILE in
 * `docs/leetype/README.md`, with its bound: a claim is shown **only** as one
 * option among others, never alone and never before a choice.
 * `claim-choices` may draw one; `reading-feedback` may say which.
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
 * A step, posed. `answerId` is exact identity with the step's own authored
 * claim, so no semantic verifier is needed, and `justification` is the
 * author's reason: *no judgment without its own justification* holds
 * literally.
 */
export type ReadingProbe = {
  stepId: string
  /**
   * Which authored field the answer came from. `ReadingSession` reads it
   * only to avoid titling a `"goal"` card with its own answer.
   */
  family: ReadingFamily
  prompt: string
  options: ReadonlyArray<ReadingOption>
  answerId: string
  justification?: string
}

/**
 * How many options a card offers, including the answer. Four fits above the
 * fold beside a hunk at 390px; three would make a lucky guess a third of the
 * time. A small pool yields fewer options, never repeated or invented ones.
 */
export const READING_OPTION_COUNT = 4

/**
 * Builds one card's question from the step, a pool of claims, and a seed.
 *
 * Distractors are other steps' own claims, not authored per-step lists
 * (which would leave existing steps unplayable and age into strawmen). The
 * whole judgement: *a distractor is another step's authored claim,
 * preferring one that shares a `concepts` entry, ordered by seed.* Sharing a
 * concept makes it a near miss rather than eliminable without reading the
 * code.
 *
 * Deterministic: same step, pool and seed give the same options in the same
 * order. The caller mixes the session seed with the step's position.
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
  // Deduplicated by text: two steps may make the same claim (a transferFrom
  // pair), and one sentence twice on a card reads as a bug.
  const seen = new Set<string>()
  const unique = candidates.filter((claim) => {
    if (seen.has(claim.text)) return false
    seen.add(claim.text)
    return true
  })

  const sharesConcept = (claim: Claim): boolean =>
    claim.concepts.some((concept) => concepts.has(concept))

  /**
   * Ranks a distractor: same family first, then shared concept. Family comes
   * first because the families read differently (a lowercase `cause` clause,
   * a lowercase `obligation`, a sentence-cased `goal` with a period), and a
   * mixed card has a typographic tell that needs no code reading.
   */
  const rank = (claim: Claim): number =>
    (claim.family === answer.family ? 0 : 2) + (sharesConcept(claim) ? 0 : 1)

  // Shuffle, then stable-sort by rank: ties break by seed, not corpus order.
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
 * Every claim a set of steps makes, in order: the distractor pool. Callers
 * pass the whole eligible corpus; one exercise's few same-concept steps
 * would be too close and too few.
 */
export function claimPoolOf(steps: ReadonlyArray<Step>): ReadonlyArray<Claim> {
  return steps.map(claimOf)
}

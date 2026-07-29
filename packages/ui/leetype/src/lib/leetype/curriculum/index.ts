import type {
  Challenge,
  CurriculumStage,
  Language,
} from "@leetype/types/leetype"

/**
 * The ladder, in order. Every consumer that needs "is this stage before that
 * one" or "render the rungs" reads it from here rather than re-listing the
 * union, so adding a rung is a one-line change.
 */
export const CURRICULUM_STAGES: ReadonlyArray<CurriculumStage> = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "integrate",
  "master",
]

type StageMeta = {
  /** Short label for a badge or a rung on the ladder. */
  label: string
  /**
   * What the player is being asked to *do* at this stage, in their own terms.
   * Not the Bloom verb — the whole point is that the pedagogy is legible
   * without knowing the taxonomy's vocabulary.
   */
  blurb: string
}

export const STAGE_META: Record<CurriculumStage, StageMeta> = {
  remember: {
    label: "Recall",
    blurb: "Get the shape of the syntax into your fingers.",
  },
  understand: {
    label: "Understand",
    blurb: "See why the construct behaves the way it does.",
  },
  apply: {
    label: "Apply",
    blurb: "Use it deliberately, on a problem that needs it.",
  },
  analyze: {
    label: "Analyze",
    blurb: "Take it apart — what breaks, what it costs, why.",
  },
  integrate: {
    label: "Integrate",
    blurb: "Combine it with everything earlier in the ladder.",
  },
  master: {
    label: "Final boss",
    blurb: "The original problem, now that nothing in it is new.",
  },
}

export function stageOrder(stage: CurriculumStage): number {
  const index = CURRICULUM_STAGES.indexOf(stage)
  // A stage outside the ladder sorts last rather than throwing — a corpus is
  // host-supplied data, and one bad row must not take the picker down.
  return index === -1 ? CURRICULUM_STAGES.length : index
}

/**
 * Curriculum order: step number first (that *is* the linearization the
 * decomposition produced), stage as a tiebreak, then title so the result is
 * total and stable. Challenges with no curriculum sort after every one that
 * has one — a decomposed ladder is the thing worth reading top to bottom;
 * loose challenges are a flat pool underneath it.
 */
export function compareByCurriculum(a: Challenge, b: Challenge): number {
  const ca = a.curriculum
  const cb = b.curriculum
  if (ca && !cb) return -1
  if (!ca && cb) return 1
  if (ca && cb) {
    if (ca.step !== cb.step) return ca.step - cb.step
    const stageDelta = stageOrder(ca.stage) - stageOrder(cb.stage)
    if (stageDelta !== 0) return stageDelta
  }
  return a.title.localeCompare(b.title)
}

/**
 * True when this pool is a decomposed curriculum rather than a flat set of
 * standalone problems. Used to decide whether the picker should present a
 * ladder at all — a mixed pool (some rows curricular, some not) still counts,
 * since the ladder is the more informative framing wherever it exists.
 */
export function hasCurriculum(challenges: ReadonlyArray<Challenge>): boolean {
  return challenges.some((challenge) => challenge.curriculum !== undefined)
}

/**
 * Preference order for picking a language when the requested one isn't in the
 * challenge's `codePaths`. Rust leads because a decomposed curriculum is
 * authored in Rust; the rest is the legacy demo pool's order.
 */
const LANGUAGE_FALLBACK_ORDER: ReadonlyArray<Language> = [
  "rust",
  "typescript",
  "cpp",
  "c",
]

/**
 * The language this challenge can actually be typed in, given what the player
 * asked for.
 *
 * A curriculum corpus ships Rust only, so a preferred language left over from
 * a previous (multi-language) challenge would otherwise resolve to an empty
 * path and surface as a load error rather than as "this exercise is in Rust."
 */
export function resolveLanguage(
  codePaths: Partial<Record<Language, string>>,
  preferred: Language
): Language {
  if (codePaths[preferred]) return preferred
  return (
    LANGUAGE_FALLBACK_ORDER.find((language) => codePaths[language]) ?? "rust"
  )
}

/**
 * The languages a challenge can be played in, in fallback order — the set the
 * language picker should offer instead of the full four.
 */
export function availableLanguages(
  codePaths: Partial<Record<Language, string>>
): Array<Language> {
  return LANGUAGE_FALLBACK_ORDER.filter((language) => codePaths[language])
}

/**
 * Adversarial label corpus for layout-invariant specs. Many responsive
 * regressions only appear when content has adversarial shape - a
 * fixed-width viewport sweep with only friendly, short labels proves
 * nothing a screenshot wouldn't already show.
 *
 * Split in two, because a `whitespace-nowrap` fix's safety depends on which
 * of these a component can actually receive (see #1192's own badge.tsx
 * review thread): a bounded, catalog-authored label can be tested against
 * "does it fit", while genuinely unbounded/user-entered content has no
 * such promise and needs a different component contract (wrapping, an
 * explicit width, or truncation) rather than a wider stress test.
 */

/**
 * Realistic for content whose source is a fixed catalog or short, curated
 * copy - e.g. an activity's name + `summarizeConfig` on the sessions route.
 * Long enough to be a meaningful stress test, but never an unbounded or
 * adversarial string, because that's not a shape this class of content can
 * take.
 */
export const BOUNDED_STRESS_LABELS: ReadonlyArray<string> = [
  "Short",
  "A moderately long normal label",
  // The literal label from #1192's report, kept verbatim so this corpus
  // stays anchored to a real regression rather than a synthetic one.
  "TOPIK Study: Beginner • 15 min",
]

/**
 * Only realistic for genuinely unbounded/user-entered content - e.g. the
 * free-form tag values in `payload-editor/context-builder` and
 * `uid-selector` that #1192's badge.tsx review thread flagged as unsafe to
 * force `whitespace-nowrap` on. Not exercised against the sessions route's
 * badges: they're catalog-sourced and can't take this shape, so failing
 * against it would be testing a scenario that cannot occur, not a real gap.
 */
export const UNBOUNDED_STRESS_LABELS: ReadonlyArray<string> = [
  // A single unbreakable token - no spaces for `white-space: nowrap` or
  // ordinary line-wrapping to break on.
  "THIS_IS_A_SINGLE_UNBREAKABLE_TOKEN_THAT_IS_EXTREMELY_LONG",
  // Repeated Hangul, which (unlike space-delimited Latin text) can wrap at
  // any character boundary and stresses word-break assumptions differently.
  "가나다라마바사아자차카타파하".repeat(4),
]

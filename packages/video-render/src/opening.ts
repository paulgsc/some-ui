/**
 * An essay's opening in the owner's own voice (IW10, paulgsc/some-ui#3177;
 * Rust Rounds, #3269): the script a week carries for the owner to read
 * before its essay, as the routine that writes the week checks it. The
 * interview week and Rust Rounds both hold their opening to these, so
 * neither keeps a copy.
 *
 * The opening says "paulgsc" in its first line, then what the practice
 * trains and why, in 25 to 90 words. It never assesses: no rating, no "how
 * ready", no finish line, since the practice doesn't end (owner,
 * 2026-11-17; C619).
 */

/** The owner's moniker, which the opening says first (owner, 2026-11-17). */
export const MONIKER = "paulgsc"

/** The opening's words: 10 to 40 seconds at the read pace. */
export const OPENING_WORDS = { min: 25, max: 90 } as const

/**
 * What the opening never says (C619): self-assessment and assessments, not
 * the work's own words ("how I assess a trade-off", "a rate limit").
 */
const ASSESSING =
  /\b(?:scor(?:e|es|ed|ing)|ratings?|rated|grad(?:e|es|ed|ing)|self-assess\w*|assessments?|readiness|how ready|ready for (?:it|the|an?)\b|pass or fail|finish(?:ed)? line|graduat\w*|levell?ed up|level up)\b/giu

const wordCount = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length

/** Every reason `script`, at `at`, isn't an opening, as lines for the routine. */
export function openingProblems(script: string, at: string): Array<string> {
  const problems: Array<string> = []
  const n = wordCount(script)
  if (n < OPENING_WORDS.min || n > OPENING_WORDS.max)
    problems.push(
      `${at}: ${n} words; write ${OPENING_WORDS.min} to ${OPENING_WORDS.max}`
    )
  const first = (script.split("\n")[0] ?? "").toLowerCase()
  if (!first.includes(MONIKER))
    problems.push(`${at}: the opening says "${MONIKER}" in its first line`)
  for (const [word] of script.matchAll(ASSESSING))
    problems.push(
      `${at}: "${word}" assesses; the opening says what the practice trains, with no rating and no finish line`
    )
  return problems
}

/**
 * An essay's opening in the owner's own voice (IW10, paulgsc/some-ui#3177;
 * Rust Rounds, #3269): the script a week carries for the owner to read
 * before its essay, as the routine that writes the week checks it. The
 * interview week and Rust Rounds both hold their opening to these, so
 * neither keeps a copy.
 *
 * The interview's opening says "paulgsc" in its first line, then what the
 * practice trains and why, in 25 to 90 words. Rust Rounds' is a
 * conversation (C738): one to three questions an observer who has never
 * seen it would ask, each with the answer the owner reads, about two to
 * three minutes across all the answers. Neither ever assesses: no rating,
 * no "how ready", no finish line, since the practice doesn't end (owner,
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

/** The words of `text`, as a reader counts them: a dash alone is none. */
const wordCount = (text: string): number =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

/** Whether `script`'s first line says the moniker. */
const saysMonikerFirst = (script: string): boolean =>
  (script.split("\n")[0] ?? "").toLowerCase().includes(MONIKER)

/** A line for each word of `text` that assesses. */
const assessing = (text: string, at: string): Array<string> =>
  [...text.matchAll(ASSESSING)].map(
    ([word]) =>
      `${at}: "${word}" assesses; the opening says what the practice trains, with no rating and no finish line`
  )

/** Every reason `script`, at `at`, isn't an opening, as lines for the routine. */
export function openingProblems(script: string, at: string): Array<string> {
  const problems: Array<string> = []
  const n = wordCount(script)
  if (n < OPENING_WORDS.min || n > OPENING_WORDS.max)
    problems.push(
      `${at}: ${n} words; write ${OPENING_WORDS.min} to ${OPENING_WORDS.max}`
    )
  if (!saysMonikerFirst(script))
    problems.push(`${at}: the opening says "${MONIKER}" in its first line`)
  problems.push(...assessing(script, at))
  return problems
}

/** The most questions a conversation opening asks: three, never more (owner, 2026-11-19). */
export const CONVERSATION_MOST = 3

/**
 * The words of all a conversation's answers together: two to three minutes
 * at the teleprompter's 170 words a minute (C734), measured across the
 * answers, not per answer (owner, 2026-11-19).
 */
export const CONVERSATION_WORDS = { min: 340, max: 510 } as const

/** The most words in one question: an observer asks it in a breath. */
export const ASK_WORDS_MOST = 20

/** One exchange of a conversation opening: what the observer asks, and the answer the owner reads. */
export type Exchange = { readonly ask: string; readonly script: string }

/**
 * Every reason `exchanges`, at `at`, isn't a conversation opening (C737), as
 * lines for whoever wrote it: one to three exchanges, the first answer says
 * "paulgsc" in its first line, the answers run two to three minutes
 * together, each question is short, and nothing assesses.
 */
export function conversationProblems(
  exchanges: ReadonlyArray<Exchange>,
  at: string
): Array<string> {
  const problems: Array<string> = []
  if (exchanges.length < 1 || exchanges.length > CONVERSATION_MOST)
    problems.push(
      `${at}: ${exchanges.length} questions; ask 1 to ${CONVERSATION_MOST}`
    )
  const total = exchanges.reduce((n, e) => n + wordCount(e.script), 0)
  if (total < CONVERSATION_WORDS.min || total > CONVERSATION_WORDS.max)
    problems.push(
      `${at}: the answers run ${total} words together; write ${CONVERSATION_WORDS.min} to ${CONVERSATION_WORDS.max}`
    )
  const first = exchanges[0]
  if (first !== undefined && !saysMonikerFirst(first.script))
    problems.push(
      `${at}[0].script: the first answer says "${MONIKER}" in its first line`
    )
  for (const [i, { ask, script }] of exchanges.entries()) {
    const asked = wordCount(ask)
    if (asked < 1 || asked > ASK_WORDS_MOST)
      problems.push(
        `${at}[${i}].ask: ${asked} words; ask in 1 to ${ASK_WORDS_MOST}`
      )
    if (wordCount(script) < 1)
      problems.push(`${at}[${i}].script: an answer says something`)
    problems.push(
      ...assessing(ask, `${at}[${i}].ask`),
      ...assessing(script, `${at}[${i}].script`)
    )
  }
  return problems
}

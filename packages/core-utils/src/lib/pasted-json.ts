/**
 * Reading JSON out of whatever a model replied: fenced blocks, bare JSON,
 * prose around it. The intakes that take a pasted reply (TOPIK's lessons,
 * LeetType's rounds, Rust Rounds) all start here.
 */

const FENCE = "```"
const LANGUAGE = "json"

/** Spaces, tabs and a CR are allowed between a fence's opening and its newline. */
const isInlineSpace = (char: string | undefined): boolean =>
  char === " " || char === "\t" || char === "\r"

/**
 * The body of every ``` or ```json fence in `text`, in order.
 *
 * A scan, not a regular expression: this reads whatever was pasted, and a
 * `\s*\n` pattern backtracks polynomially on many whitespace-and-newline
 * pairs (CodeQL, #1564). Each fence is visited once: linear in `text`.
 */
export function fencedBodies(text: string): Array<string> {
  const bodies: Array<string> = []
  let from = 0
  for (;;) {
    const open = text.indexOf(FENCE, from)
    if (open === -1) return bodies
    let at = open + FENCE.length
    if (text.startsWith(LANGUAGE, at)) at += LANGUAGE.length
    while (isInlineSpace(text[at])) at += 1
    if (text[at] !== "\n") {
      // Not an opening fence (```ts, or text after the backticks): look again
      // from the next character.
      from = open + 1
      continue
    }
    const close = text.indexOf(FENCE, at + 1)
    if (close === -1) return bodies
    bodies.push(text.slice(at + 1, close))
    from = close + FENCE.length
  }
}

/**
 * Every JSON value in a pasted reply: its fenced blocks that parse, or, when
 * it has no fence, the whole text if it parses.
 */
export function jsonValues(text: string): Array<unknown> {
  const fenced = fencedBodies(text)
  const candidates = fenced.length > 0 ? fenced : [text]
  return candidates.flatMap((candidate) => {
    try {
      const value: unknown = JSON.parse(candidate)
      return [value]
    } catch {
      // Not JSON: prose in a fence, or a reply with no JSON at all. The
      // caller says what it found missing.
      return []
    }
  })
}

/** @vitest-environment node */
import { TAKE_OFS } from "@soundbites/lib/library/kinds"
import { CODES } from "@soundbites/lib/reconcile/codes"
import { RECONCILE_WORDS } from "@soundbites/lib/reconcile/words"
import { describe, expect, it } from "vitest"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), the transcriber's own terms
 * and home's codes among them.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue|retry|null|undefined|database|store|blob|ref|id|query|transcri\w*|whisper|model|engine|verdict|code|confidence|logprob|garbled|deadline|reconcil\w*|library|404|409|422)\b|_/i

/** Other words for a recording: "take" is the one (ST34). */
const OTHER_WORDS = /\b(recordings?|answers?|bites?|notes?|clips?)\b/i

/** Home's names for its kinds of take, and one it may add. */
const OFS = [...TAKE_OFS, "newer"]

const AT = "2026-11-03T09:00:00.000Z"

/** Every word the table says: each fixed one, and each a maker makes. */
function everyWord(): Array<string> {
  const {
    wayIn,
    shown,
    noneShown,
    codes,
    heardAs,
    said,
    of,
    acts,
    done,
    source,
    ...fixed
  } = RECONCILE_WORDS
  return [
    ...Object.values(fixed),
    ...[0, 1, 7].flatMap((n) => [wayIn(n), shown(n, n)]),
    shown(100, 140),
    noneShown(1),
    noneShown(4),
    ...CODES.flatMap((code) => [codes[code].name, codes[code].line]),
    heardAs("pt", "en"),
    heardAs("xx", null),
    said(AT),
    ...OFS.map(of),
    ...Object.values(acts),
    ...Object.values(done),
    ...Object.values(source),
  ]
}

describe("the takes needing attention's words (HEARD3)", () => {
  const all = everyWord()

  it("never name the machinery, nor home's codes", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("call a recording a take, and nothing else (ST34)", () => {
    expect(all.filter((text) => OTHER_WORDS.test(text))).toEqual([])
  })

  it("name a game's take as the owner asked (2026-11-17)", () => {
    expect(RECONCILE_WORDS.of("game")).toBe("A take from a game")
  })

  it("name each code apart, never one for all (owner, #3070)", () => {
    const names = CODES.map((code) => RECONCILE_WORDS.codes[code].name)
    expect(new Set(names).size).toBe(CODES.length)
  })

  it("say the language home heard against the one the take is said in", () => {
    expect(RECONCILE_WORDS.heardAs("pt", "en")).toBe(
      "Heard as Portuguese, said in English."
    )
    expect(RECONCILE_WORDS.heardAs("xx", null)).toBe(
      "Heard as another language."
    )
  })

  it("say when fewer show than wait, and never that nothing waits when some do", () => {
    expect(RECONCILE_WORDS.shown(100, 140)).toBe(
      "100 of the 140 takes home couldn't hear well show here, by what went wrong."
    )
    expect(RECONCILE_WORDS.noneShown(1)).toBe(
      "1 take home couldn't hear well waits on home but doesn't show here."
    )
    expect(RECONCILE_WORDS.noneShown(2)).toMatch(
      /^2 takes .* wait on home but don't show here\.$/
    )
    expect(RECONCILE_WORDS.shown(3, 3)).toBe(
      "3 takes home couldn't hear well, by what went wrong."
    )
  })

  it("count the takes waiting", () => {
    expect(RECONCILE_WORDS.wayIn(1)).toBe("1 take home couldn't hear well")
    expect(RECONCILE_WORDS.wayIn(3)).toBe("3 takes home couldn't hear well")
  })
})

/** @vitest-environment node */
import { seconds, STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { describe, expect, it } from "vitest"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), with Studio's own machinery.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue|retry|null|undefined|indexeddb|database|store|blob|shot|cut list|revision|rev|keeper|pending|write|refused)\b/i

/** Every fixed word in the table. */
function fixed(table: unknown): Array<string> {
  if (typeof table === "string") return [table]
  if (typeof table === "object" && table !== null)
    return Object.values(table).flatMap(fixed)
  return []
}

const W = STUDIO_WORDS
const TITLE = "Playoff Delta, week 8"

/** Every word the table makes, from a sample of what it is given. */
const MADE: ReadonlyArray<string> = [
  W.start.which(TITLE),
  W.start.nextVersion(TITLE),
  W.start.opened(TITLE),
  W.start.revised(TITLE),
  W.record.sceneOf(2, 3),
  W.record.onScreen("The path card"),
  W.record.mustStayTrue(2),
  W.record.runs(20_000),
  W.record.runsWith(4_700),
  W.record.upTo(120_000),
  W.record.elapsed(4_700, 120_000),
  W.record.blocked("denied"),
  W.notice.kept(4_700),
  W.notice.carried(TITLE, 0, 0),
  W.notice.carried(TITLE, 0, 1),
  W.notice.carried(TITLE, 2, 3),
  W.start.onPhone(1),
  W.start.onPhone(4),
  W.notice.carryStays,
  W.notice.carryUnread,
  W.notice.cleared(1),
  W.notice.cleared(3),
  W.notice.arrived(1),
  W.notice.arrived(3),
  W.done.opensOn(2, "The miss"),
  W.standing(null),
  W.standing({ done: "Kept takes for scene 1.", next: "Scene 2: The miss." }),
  W.recordStatus(1, 3),
  W.recordStatus(3, 3),
  W.sittingDone([]),
  W.sittingDone([1, 2]),
  W.sittingNext(null),
  W.sittingNext({ n: 2, artifact: "The miss" }),
]

describe("Studio's words", () => {
  const all = [...fixed(STUDIO_WORDS), ...MADE]

  it("are many, so the walk above reached them", () => {
    expect(fixed(STUDIO_WORDS).length).toBeGreaterThan(40)
  })

  it("never name the machinery", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("write a length as a number of seconds", () => {
    expect(seconds(4_700)).toBe("4.7 s")
    expect(STUDIO_WORDS.record.runsWith(5_200)).toBe(
      "This scene runs 5.2 s: your take and a breath"
    )
  })

  it("leave a sitting's log in lines the next sitting reads", () => {
    expect(STUDIO_WORDS.sittingDone([])).toBe("No takes this sitting.")
    expect(STUDIO_WORDS.sittingDone([2])).toBe("Kept takes for scene 2.")
    expect(STUDIO_WORDS.sittingDone([1, 2, 4])).toBe(
      "Kept takes for scenes 1, 2 and 4."
    )
    expect(STUDIO_WORDS.sittingNext({ n: 3, artifact: "End card" })).toBe(
      "Scene 3: End card."
    )
    expect(
      STUDIO_WORDS.standing({
        done: "Kept takes for scene 2.",
        next: "Scene 3: End card.",
      })
    ).toBe("Last time: Kept takes for scene 2. Next: Scene 3: End card.")
  })

  it("say what to do when the phone is full", () => {
    const full = STUDIO_WORDS.notice.full
    expect(full).toMatch(/wasn't kept/)
    expect(full).toMatch(/share a video's takes with Claude/)
    expect(full).toMatch(/the room they held is free/)
  })

  it("never say takes were kept where a sitting wasn't saved", () => {
    expect(STUDIO_WORDS.done.notSaved).not.toMatch(/takes are kept/)
  })
})

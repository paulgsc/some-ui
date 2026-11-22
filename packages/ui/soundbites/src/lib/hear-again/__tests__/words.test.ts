/** @vitest-environment node */
import { HEAR_AGAIN_WORDS } from "@soundbites/lib/hear-again/words"
import { describe, expect, it } from "vitest"

/** How it works, not what it does (CLAUDE.md, "State in the person's terms"). */
const MACHINERY =
  /\b(server|request|response|status|error|api|retry|snooze\w*|queue|null|undefined|transcri\w*|model|engine|verdict|code|429|404)\b|_/i

const AT = "2026-11-03T09:00:00.000Z"

describe("the words of asking home to try a take again (#3339)", () => {
  const { askAgainAt, said, ...fixed } = HEAR_AGAIN_WORDS
  const all = [...Object.values(fixed), ...Object.values(said), askAgainAt(AT)]

  it("never name the machinery", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("say when home can be asked again, by its day and time", () => {
    expect(askAgainAt(AT)).toMatch(/^You can ask again .+ at .+\.$/)
    expect(askAgainAt(AT)).toContain(
      new Date(AT).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    )
  })
})

/**
 * The notice as a value (RUN5): what home is owed follows from what the
 * person wants, the token the phone holds and the token home holds, in every
 * combination of the three.
 */
import { describe, expect, it } from "vitest"

import type { NoticeState } from "@/lib/jobs/notice"
import { NO_NOTICE, noticeFiling, stepNotice } from "@/lib/jobs/notice"

describe("what home is owed", () => {
  const tokens = [null, "a", "b"] as const
  const every: Array<NoticeState> = [false, true].flatMap((wanted) =>
    tokens.flatMap((token) => tokens.map((filed) => ({ wanted, token, filed })))
  )

  it.each(every)("for %o, one step toward what is wanted", (n) => {
    const filing = noticeFiling(n)
    const settled = n.wanted ? n.token : null
    if (n.filed === settled) {
      expect(filing).toBeNull()
      return
    }
    if (n.filed !== null) {
      expect(filing).toEqual({ method: "DELETE", token: n.filed })
      return
    }
    expect(filing).toEqual({ method: "PUT", token: n.token })
  })

  it("reaches what is wanted in at most two filings", () => {
    for (const start of every) {
      let n = start
      for (let i = 0; i < 2; i += 1) {
        const filing = noticeFiling(n)
        if (filing === null) break
        n = stepNotice(n, {
          type: "notice-filed",
          token: filing.method === "PUT" ? filing.token : null,
        })
      }
      expect(noticeFiling(n)).toBeNull()
    }
  })

  it("changes nothing that is already so", () => {
    expect(
      stepNotice(NO_NOTICE, { type: "notice-wanted", wanted: false })
    ).toBe(NO_NOTICE)
    expect(stepNotice(NO_NOTICE, { type: "notice-token", token: null })).toBe(
      NO_NOTICE
    )
    expect(stepNotice(NO_NOTICE, { type: "notice-filed", token: null })).toBe(
      NO_NOTICE
    )
  })
})

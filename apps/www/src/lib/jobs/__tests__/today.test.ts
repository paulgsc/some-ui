import { describe, expect, it } from "vitest"

import { EMPTY, step } from "@/lib/jobs/model"
import { nextPick } from "@/lib/jobs/today"

import { digest, OPENED_AT } from "./fixture"

describe("nextPick", () => {
  it("opens on the digest on show first, then the newest other one, and none once all are decided", () => {
    const older = digest("2026-10-17")
    const newer = digest("2026-10-18")
    let state = step(EMPTY, { type: "opened", digest: newer, at: OPENED_AT })
    state = step(state, { type: "opened", digest: older, at: OPENED_AT })
    expect(nextPick(state)?.day).toBe("2026-10-17")
    state = { ...state, current: "2026-10-18" }
    expect(nextPick(state)).toMatchObject({
      day: "2026-10-18",
      pick: { id: newer.picks[0].id },
    })
    let n = 0
    for (const d of [older, newer]) {
      for (const pick of d.picks) {
        n += 1
        state = step(state, {
          type: "record",
          event: {
            type: "archived",
            day: d.day,
            pickId: pick.id,
            fingerprint: pick.fingerprint,
          },
          stamp: { id: `e${n}`, at: OPENED_AT },
        })
      }
    }
    expect(nextPick(state)).toBeNull()
  })
})

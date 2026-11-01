/**
 * @vitest-environment node
 *
 * Let go owes the mark before the standing (LA13, MIC2): nothing is written
 * when the mark can't be kept, and the mark is taken back when the write
 * fails; with no lane wired, owing answers yes.
 */
import { describe, expect, it } from "vitest"

import type { MarkOwing } from "@/lib/voice-marks"
import { setAsideOwing, voiceMarks, wireVoiceMarks } from "@/lib/voice-marks"

const AT = "2026-11-01T09:15:00.000Z"

/** A lane's owing that records what happened, in order. */
function lane(keeps: boolean, log: Array<string>): MarkOwing {
  return {
    owe: (id, at): boolean => {
      log.push(`owe ${id} ${at}`)
      return keeps
    },
    unowe: (id): void => {
      log.push(`unowe ${id}`)
    },
  }
}

describe("setAsideOwing (LA13)", () => {
  it("owes the mark first, then writes the standing", () => {
    const log: Array<string> = []
    const written = setAsideOwing(
      "n1",
      AT,
      () => {
        log.push("write")
        return true
      },
      lane(true, log)
    )
    expect(written).toBe(true)
    expect(log).toEqual([`owe n1 ${AT}`, "write"])
  })

  it("writes nothing when the mark can't be kept, and takes it back when the write fails", () => {
    const refused: Array<string> = []
    expect(
      setAsideOwing(
        "n1",
        AT,
        () => {
          refused.push("write")
          return true
        },
        lane(false, refused)
      )
    ).toBe(false)
    expect(refused).toEqual([`owe n1 ${AT}`])

    const failed: Array<string> = []
    expect(setAsideOwing("n1", AT, () => false, lane(true, failed))).toBe(false)
    expect(failed).toEqual([`owe n1 ${AT}`, "unowe n1"])
  })

  it("owes through the lane while it is wired, and answers yes with none", () => {
    expect(voiceMarks.owe("n1", AT)).toBe(true)
    const log: Array<string> = []
    const unwire = wireVoiceMarks(lane(false, log))
    expect(voiceMarks.owe("n1", AT)).toBe(false)
    expect(setAsideOwing("n2", AT, () => true)).toBe(false)
    unwire()
    expect(voiceMarks.owe("n3", AT)).toBe(true)
    expect(log).toEqual([`owe n1 ${AT}`, `owe n2 ${AT}`])
  })
})

/**
 * @vitest-environment node
 *
 * A file asked of home on the renders' conveyor (ASSETS-R): every step state
 * and every reason home gives reads as one station of the render line, a side
 * track where it stopped, and a time where home gave one; and every line it
 * says is in the person's terms.
 */
import { describe, expect, it } from "vitest"

import type { Step, StepState } from "@/lib/call-videos/assets"
import { STEP_STATES } from "@/lib/call-videos/assets"
import {
  FILE_STATIONS,
  FILE_STRIP,
  fileConveyor,
} from "@/lib/call-videos/step-conveyor"
import { ASSET_WORDS } from "@/lib/call-videos/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { STATIONS } from "@/lib/renders/conveyor"

const AT = "2026-11-22T23:05:00Z"

const step = (state: StepState, over: Partial<Step> = {}): Step => ({
  asset: "thumbnail",
  state,
  ...over,
})

describe("fileConveyor", () => {
  it("is the render line less Boxing, in its order", () => {
    expect(FILE_STATIONS).toEqual(STATIONS.filter((id) => id !== "boxing"))
    expect(FILE_STRIP.map((s) => s.id)).toEqual([...FILE_STATIONS])
  })

  it("puts each state under way at its station, with its time", () => {
    expect(fileConveyor(step("asked", { askedAt: AT }))).toEqual({
      at: "line",
      aside: null,
      when: { kind: "asked", at: AT },
    })
    expect(fileConveyor(step("waiting", { askedAt: AT }))).toEqual({
      at: "room",
      aside: null,
      when: { kind: "asked", at: AT },
    })
    expect(
      fileConveyor(step("rendering", { askedAt: AT, startedAt: AT }))
    ).toEqual({
      at: "oven",
      aside: null,
      when: { kind: "started", at: AT },
    })
    expect(fileConveyor(step("done", { endedAt: AT }))).toEqual({
      at: "ready",
      aside: null,
      when: { kind: "ended", at: AT },
    })
  })

  it("says no time where home gave none", () => {
    for (const state of STEP_STATES)
      expect(fileConveyor(step(state)).when).toBeNull()
  })

  it("sets a stopped file beside the line, by why", () => {
    const cases: ReadonlyArray<[Step, unknown]> = [
      [
        step("failed", { reason: "recorder" }),
        { aside: "burnt", why: "couldNot" },
      ],
      [step("failed"), { aside: "burnt", why: "couldNot" }],
      [
        step("blocked", { reason: "too-long" }),
        { aside: "tooBigForOven", why: "tooLong" },
      ],
      [
        step("blocked", { reason: "too-large" }),
        { aside: "tooBigForBox", why: "tooLarge" },
      ],
      [
        step("blocked", { reason: "overflow" }),
        { aside: "spilledOver", why: "overflow" },
      ],
      [
        step("blocked", { reason: "no-video" }),
        { aside: "counter", why: "noVideo" },
      ],
      [
        step("blocked", { reason: "take-unheard" }),
        { aside: "counter", why: "missingInput" },
      ],
      [
        step("blocked", { reason: "something-new" }),
        { aside: "counter", why: "held" },
      ],
      [step("blocked"), { aside: "counter", why: "held" }],
      [
        step("failed", { reason: "something-new" }),
        { aside: "burnt", why: "couldNot" },
      ],
    ]
    for (const [s, aside] of cases) expect(fileConveyor(s).aside).toEqual(aside)
    expect(fileConveyor(step("failed", { startedAt: AT })).at).toBe("oven")
    expect(fileConveyor(step("blocked", { reason: "no-video" })).at).toBe(
      "line"
    )
  })
})

describe("ASSET_WORDS' conveyor lines", () => {
  it("say each time on the clock, and nothing for a time that doesn't read", () => {
    expect(ASSET_WORDS.when.asked(AT, "UTC")).toBe("Asked for Sun 11:05 PM.")
    expect(ASSET_WORDS.when.started(AT, "UTC")).toBe(
      "In the oven since Sun 11:05 PM."
    )
    expect(ASSET_WORDS.when.ended(AT, "UTC")).toBe("Off the line Sun 11:05 PM.")
    expect(ASSET_WORDS.when.asked("soon", "UTC")).toBeNull()
  })

  it("name no machinery", () => {
    const said = [
      ...Object.values(ASSET_WORDS.why),
      ASSET_WORDS.when.asked(AT, "UTC"),
      ASSET_WORDS.when.started(AT, "UTC"),
      ASSET_WORDS.when.ended(AT, "UTC"),
    ]
    for (const line of said) expect(line).not.toMatch(MACHINERY)
  })
})

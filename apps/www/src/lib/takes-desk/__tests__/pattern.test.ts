/**
 * @vitest-environment jsdom
 *
 * The pattern desk (`createPatternTakes`) on the simulated microphone, its
 * list in `localStorage`: a Redo supersedes in one write and keeps the
 * earlier take (D2), Let go sets a take aside and keeps it (D3), each take
 * says where it is kept, and at its cap a new take makes room only with one
 * home holds.
 */
import { microphoneOwner } from "@some-ui/voice-capture"
import { simulatedMicrophone } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TestDesk } from "./desk"
import { testDesk } from "./desk"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

function desk(max = 40): TestDesk {
  return testDesk(simulatedMicrophone({ now: Date.now }), microphoneOwner(), {
    max,
    maxMs: 60_000,
  })
}

/** One take answering `answers`, tapped on, talked `ms` and tapped off. */
async function take(
  on: TestDesk,
  answers: string,
  ms = 2_000,
  supersedes: string | null = null
): Promise<void> {
  on.phone.pattern.tap(answers, supersedes)
  await settle(ms)
  on.phone.pattern.tap(answers)
  await settle()
}

describe("createPatternTakes", () => {
  it("keeps a take on this phone, listed with its audio, as the pattern lists it", async () => {
    const on = desk()
    await take(on, "t1-01#s15", 4_000)
    expect(on.phone.pattern.getSnapshot().ended).toMatchObject({
      ending: "kept",
      id: "n1",
    })
    expect(on.phone.takes.getSnapshot()).toEqual([
      {
        id: "n1",
        answers: "t1-01#s15",
        durationMs: 4_000,
        recordedAt: expect.any(String),
        standing: "current",
        place: "phone",
      },
    ])
    expect(await on.shelf.ids()).toEqual(["n1"])
  })

  it("makes a Redo's take the item's, the earlier one kept as earlier, in one write (D2)", async () => {
    const on = desk()
    await take(on, "card")
    const add = vi.fn()
    on.phone.takes.subscribe(add)
    await take(on, "card", 3_000, "n1")
    expect(add).toHaveBeenCalledOnce()
    expect(on.listed()).toEqual([
      expect.objectContaining({ id: "n2" }),
      expect.objectContaining({ id: "n1", standing: "earlier" }),
    ])
    expect(on.listed()[0]?.standing).toBeUndefined()
    expect(await on.shelf.ids()).toEqual(["n1", "n2"])
  })

  it("sets a take aside and keeps it, audio and all (D3)", async () => {
    const on = desk()
    await take(on, "card")
    on.phone.pattern.letGo("n1", "phone")
    expect(on.phone.takes.getSnapshot()).toEqual([
      expect.objectContaining({ id: "n1", standing: "set-aside" }),
    ])
    expect(await on.shelf.ids()).toEqual(["n1"])
  })

  it("says a take is on home once home holds it", async () => {
    const on = desk()
    await take(on, "card")
    on.home.add("n1")
    on.phone.recount()
    expect(on.phone.takes.getSnapshot()).toEqual([
      expect.objectContaining({ id: "n1", place: "home" }),
    ])
  })

  it("refuses a take at its cap while home holds none, letting none go", async () => {
    const on = desk(1)
    await take(on, "a")
    expect(on.phone.full()).toBe(true)
    await take(on, "b")
    expect(on.phone.pattern.getSnapshot().ended).toMatchObject({
      answers: "b",
      ending: "full",
    })
    expect(on.listed().map(({ id }) => id)).toEqual(["n1"])
  })

  it("makes room at its cap by letting go the oldest take home holds (HF5)", async () => {
    const on = desk(2)
    await take(on, "a")
    await take(on, "b")
    on.home.add("n1")
    on.phone.recount()
    expect(on.phone.full()).toBe(false)
    await take(on, "c")
    expect(on.listed().map(({ id }) => id)).toEqual(["n3", "n2"])
    expect((await on.shelf.ids()).sort()).toEqual(["n2", "n3"])
  })

  it("lets a take go with its audio when the sweep finds it silent", async () => {
    const on = desk()
    await take(on, "a")
    on.phone.letGo(["n1"])
    expect(on.phone.takes.getSnapshot()).toEqual([])
    await settle()
    expect(await on.shelf.ids()).toEqual([])
  })
})

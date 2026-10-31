/**
 * The phone's asks for the next scene (LA18): every ask home does not hold
 * stays, with no limit; one home holds goes once a newer ask is kept, the
 * newest staying to say so; and what the screen says is in the person's
 * terms.
 */
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { AskedPrompt } from "@/lib/scene-ask"
import {
  afterAsk,
  afterHeld,
  ASK_WORDS,
  createSceneAsks,
  isAsked,
  snapshotOf,
} from "@/lib/scene-ask"

const asked = (n: number): AskedPrompt => ({
  stamp: `drama-2026103${String(n)}T071503120Z`,
  at: `2026-10-3${String(n)}T07:15:03.120Z`,
  text: `prompt ${String(n)}`,
  notes: [`n${String(n)}`],
})
const stamps = (kept: ReadonlyArray<AskedPrompt>): Array<string> =>
  kept.map(({ stamp, held }) => (held === true ? `${stamp}:held` : stamp))

describe("what the phone keeps", () => {
  it("keeps every ask home does not hold, however many", () => {
    let kept: Array<AskedPrompt> = []
    for (const n of [0, 1]) kept = afterAsk(kept, asked(n))
    expect(stamps(kept)).toEqual([asked(0).stamp, asked(1).stamp])
    expect(stamps(afterHeld(kept, new Set()))).toEqual(stamps(kept))
  })

  it("lets go of one home holds only while a newer ask is kept, and keeps the newest to say so", () => {
    const kept = [asked(0), asked(1)]
    expect(stamps(afterHeld(kept, new Set([asked(0).stamp])))).toEqual([
      asked(1).stamp,
    ])
    expect(stamps(afterHeld(kept, new Set([asked(1).stamp])))).toEqual([
      asked(0).stamp,
      `${asked(1).stamp}:held`,
    ])
    const held = afterHeld([asked(0)], new Set([asked(0).stamp]))
    expect(stamps(held)).toEqual([`${asked(0).stamp}:held`])
    expect(stamps(afterAsk(held, asked(1)))).toEqual([asked(1).stamp])
  })

  it("reads back only what it wrote", () => {
    expect(isAsked(asked(0))).toBe(true)
    expect(isAsked({ ...asked(0), held: true })).toBe(true)
    expect(isAsked({ ...asked(0), held: false })).toBe(false)
    expect(isAsked({ ...asked(0), notes: [1] })).toBe(false)
    expect(isAsked({ stamp: "x" })).toBe(false)
  })
})

describe("the store", () => {
  it("keeps an ask, says so, and lets it go on the drain's word", () => {
    const storage = memoryStorage()
    const asks = createSceneAsks({ storage: () => storage })
    const heard: Array<boolean> = []
    asks.subscribe(() => {
      heard.push(asks.getSnapshot().held)
    })
    expect(asks.getSnapshot()).toEqual({ said: ASK_WORDS.none, held: false })
    expect(asks.ask(asked(0))).toBe(true)
    expect(asks.kept()).toEqual([asked(0)])
    asks.held(new Set([asked(0).stamp]))
    expect(asks.getSnapshot().held).toBe(true)
    expect(heard).toEqual([false, true])
    expect(asks.getSnapshot()).toBe(asks.getSnapshot())
  })

  it("says it kept nothing without storage", () => {
    const asks = createSceneAsks({ storage: () => null })
    expect(asks.ask(asked(0))).toBe(false)
    expect(asks.kept()).toEqual([])
  })
})

describe("what the screen says", () => {
  it("names where the ask is and since when, never the machinery", () => {
    const lines = [
      snapshotOf([]).said,
      snapshotOf([asked(0)]).said,
      snapshotOf([asked(0), asked(1)]).said,
      snapshotOf([{ ...asked(1), held: true }]).said,
    ]
    expect(new Set(lines).size).toBe(4)
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
    expect(lines.filter((line) => /mailbox|stamp|drain/i.test(line))).toEqual(
      []
    )
  })
})

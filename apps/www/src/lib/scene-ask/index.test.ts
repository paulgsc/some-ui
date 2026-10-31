/**
 * The phone's asks for the next scene (LA18): every ask home does not hold
 * stays, with no limit, and none is replaced; one home holds goes once a
 * newer ask is kept, the newest staying, as its stamp and time only, to say
 * so; and what the screen says is in the person's terms.
 */
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { FIT_HELD } from "@tests/ui-fit/panel-page/fixtures"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { AskedPrompt, PendingAsk } from "@/lib/scene-ask"
import {
  afterAsk,
  afterHeld,
  ASK_WORDS,
  createSceneAsks,
  isAsked,
  snapshotOf,
} from "@/lib/scene-ask"

const asked = (n: number): PendingAsk => ({
  stamp: `drama-2026103${String(n)}T071503120Z`,
  at: `2026-10-3${String(n)}T07:15:03.120Z`,
  text: `prompt ${String(n)}`,
  notes: [`n${String(n)}`],
})
const stamps = (kept: ReadonlyArray<AskedPrompt>): Array<string> =>
  kept.map(({ stamp, held }) => (held === true ? `${stamp}:held` : stamp))

const heldAs = (prompt: PendingAsk): AskedPrompt => ({
  stamp: prompt.stamp,
  at: prompt.at,
  held: true,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("what the phone keeps", () => {
  it("keeps every ask home does not hold, however many", () => {
    let kept: Array<AskedPrompt> = []
    for (const n of [0, 1]) kept = afterAsk(kept, asked(n)) ?? []
    expect(stamps(kept)).toEqual([asked(0).stamp, asked(1).stamp])
    expect(stamps(afterHeld(kept, new Set()))).toEqual(stamps(kept))
  })

  it("never replaces a kept ask: one with a kept stamp is refused", () => {
    const first = asked(0)
    expect(afterAsk([first], { ...first, text: "second" })).toBeNull()
    expect(afterAsk([heldAs(first)], { ...first, text: "second" })).toBeNull()
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
    expect(stamps(afterAsk(held, asked(1)) ?? [])).toEqual([asked(1).stamp])
  })

  it("keeps of the held newest only what the screen says of it", () => {
    expect(afterHeld([asked(0)], new Set([asked(0).stamp]))).toEqual([
      heldAs(asked(0)),
    ])
    // One kept held from before is cut down the same way at the next write.
    expect(
      afterHeld([{ ...asked(0), held: true }, asked(1)], new Set())
    ).toEqual([asked(1)])
    expect(afterHeld([{ ...asked(0), held: true }], new Set())).toEqual([
      heldAs(asked(0)),
    ])
  })

  it("reads back only what it wrote", () => {
    expect(isAsked(asked(0))).toBe(true)
    expect(isAsked({ ...asked(0), held: true })).toBe(true)
    expect(isAsked(heldAs(asked(0)))).toBe(true)
    expect(isAsked({ stamp: asked(0).stamp, at: asked(0).at })).toBe(false)
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
    expect(asks.kept()).toEqual([heldAs(asked(0))])
    expect(heard).toEqual([false, true])
    expect(asks.getSnapshot()).toBe(asks.getSnapshot())
  })

  it("refuses an ask with a kept stamp, keeps the first, and reports it", () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})
    const storage = memoryStorage()
    const asks = createSceneAsks({ storage: () => storage })
    expect(asks.ask(asked(0))).toBe(true)
    expect(asks.ask({ ...asked(0), text: "second" })).toBe(false)
    expect(asks.kept()).toEqual([asked(0)])
    expect(reported).toHaveBeenCalledOnce()
  })

  it("says it kept nothing without storage, and reports it", () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})
    const asks = createSceneAsks({ storage: () => null })
    expect(asks.ask(asked(0))).toBe(false)
    expect(asks.kept()).toEqual([])
    expect(reported).toHaveBeenCalledOnce()
  })

  it("reports a write the device refuses", () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})
    const storage = memoryStorage()
    const asks = createSceneAsks({
      storage: () => ({
        getItem: (key): string | null => storage.getItem(key),
        removeItem: (key): void => {
          storage.removeItem(key)
        },
        setItem: (): never => {
          throw new Error("full")
        },
      }),
    })
    expect(asks.ask(asked(0))).toBe(false)
    expect(reported).toHaveBeenCalledOnce()
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

  it("is what the ui-fit page shows, the held line its longest", () => {
    // The fit page's line is written in en-US, Pacific time.
    const local = Date.prototype.toLocaleString
    vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (
      this: Date,
      _locales,
      options
    ) {
      return local.call(this, "en-US", {
        ...options,
        timeZone: "America/Los_Angeles",
      })
    })
    const at = "2026-10-31T16:15:00Z"
    expect(FIT_HELD.said).toBe(ASK_WORDS.held(at))
    for (const line of [ASK_WORDS.none, ASK_WORDS.waiting(at, 12)]) {
      expect(line.length).toBeLessThanOrEqual(FIT_HELD.said.length)
    }
  })
})

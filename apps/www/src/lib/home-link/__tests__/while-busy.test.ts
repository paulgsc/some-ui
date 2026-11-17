/**
 * `../while-busy`'s `askWhileBusy` (RO1, #3155): a link that stays busy for
 * every try, or a read no longer wanted, ends `busy`, never `unreachable`,
 * so a screen says this phone was busy rather than that home can't be
 * reached. Every other end comes back as the ask said it, at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NotAnswered } from "@/lib/home-link/while-busy"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { mapFileHostError } from "@/lib/intent/errors"
import { PhoneBusyError, phoneWasBusy, readFailure } from "@/lib/phone-busy"

type Answered = { readonly kind: "answered"; readonly answer: string }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("askWhileBusy", () => {
  it("ends busy once the link stayed busy for every try", async () => {
    const ask = vi.fn(
      (): Promise<Answered | NotAnswered> => Promise.resolve({ kind: "busy" })
    )
    const ended = askWhileBusy(ask)
    await vi.runAllTimersAsync()
    await expect(ended).resolves.toEqual({ kind: "busy" })
    expect(ask).toHaveBeenCalledTimes(10)
  })

  it("ends busy, asking nothing more, once the read is no longer wanted", async () => {
    let wanted = true
    const ask = vi.fn((): Promise<Answered | NotAnswered> => {
      wanted = false
      return Promise.resolve({ kind: "busy" })
    })
    const ended = askWhileBusy(ask, () => wanted)
    await vi.runAllTimersAsync()
    await expect(ended).resolves.toEqual({ kind: "busy" })
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it.each<Answered | NotAnswered>([
    { kind: "answered", answer: "a" },
    { kind: "unpaired" },
    { kind: "unreachable" },
  ])("comes back with $kind after a busy try", async (end) => {
    const ask = vi
      .fn<() => Promise<Answered | NotAnswered>>()
      .mockResolvedValueOnce({ kind: "busy" })
      .mockResolvedValue(end)
    const ended = askWhileBusy(ask)
    await vi.runAllTimersAsync()
    await expect(ended).resolves.toEqual(end)
    expect(ask).toHaveBeenCalledTimes(2)
  })
})

describe("phoneWasBusy", () => {
  it("knows a busy read's rejection, raw and as a query maps it", () => {
    const busy = new PhoneBusyError("busy")
    expect(phoneWasBusy(busy)).toBe(true)
    expect(phoneWasBusy(mapFileHostError(busy))).toBe(true)
    expect(phoneWasBusy(new Error("home didn't answer"))).toBe(false)
    expect(phoneWasBusy(null)).toBe(false)
  })

  it("says why a kept read's latest read failed", () => {
    expect(readFailure(false, null)).toBeNull()
    expect(readFailure(true, new PhoneBusyError("busy"))).toBe("busy")
    expect(readFailure(true, new Error("home didn't answer"))).toBe("away")
  })
})

/**
 * The one pace every request to home takes a turn on (AD3, HERD1, `../pace`).
 */
import { fakeClock } from "@/test-support/fake-clock"
import { describe, expect, it } from "vitest"

import type { PaceKept, PaceMemory } from "@/lib/home-link/pace"
import {
  BURST,
  createPace,
  MS_PER_REQUEST,
  storedPace,
} from "@/lib/home-link/pace"

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/** A page's store, kept between the pages a test opens on it. */
function memory(): PaceMemory & { kept: PaceKept | null } {
  const box: PaceMemory & { kept: PaceKept | null } = {
    kept: null,
    read: () => box.kept,
    write: (kept) => {
      box.kept = kept
    },
  }
  return box
}

describe("the pace", () => {
  it("paces every request so that the phone never empties a bucket of 20 that refills one each 2 s: BURST at once, then one each 2 s, whoever asks (AD3, HERD1)", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    // The smallest bucket home may keep (two digits, a refill of one each
    // 2 s at most this slow, past which home's own 429 paces it).
    const size = 20
    let bucket = size
    let filled = 0
    let lowest = bucket
    let went = 0
    const take = (urgent: boolean): Promise<void> =>
      pace.turn(urgent).then(() => {
        bucket =
          Math.min(size, bucket + (clock.now() - filled) / MS_PER_REQUEST) - 1
        filled = clock.now()
        lowest = Math.min(lowest, bucket)
        went += 1
      })
    const pass = async (ms: number): Promise<void> => {
      clock.pass(ms)
      await settle()
    }
    const turns = Array.from({ length: BURST + 3 }, (_, i) => take(i % 3 === 0))
    await settle()
    expect(went).toBe(BURST)
    await pass(MS_PER_REQUEST - 1)
    expect(went).toBe(BURST)
    await pass(1)
    expect(went).toBe(BURST + 1)
    await pass(2 * MS_PER_REQUEST)
    expect(went).toBe(BURST + 3)
    await Promise.all(turns)
    // Left alone, it refills to the burst and no further.
    await pass(600_000)
    const again = Array.from({ length: BURST + 1 }, (_, i) => take(i % 2 === 0))
    await settle()
    expect(went).toBe(BURST + 3 + BURST)
    await pass(MS_PER_REQUEST)
    await Promise.all(again)
    expect(lowest).toBeGreaterThanOrEqual(0)
  })

  it("gives the person's turn ahead of every drain turn waiting", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    const order: Array<string> = []
    await Promise.all(Array.from({ length: BURST }, () => pace.turn(false)))
    const drain = Array.from({ length: 3 }, (_, i) =>
      pace.turn(false).then(() => order.push(`drain ${String(i)}`))
    )
    const read = pace.turn(true).then(() => order.push("read"))
    clock.pass(MS_PER_REQUEST)
    await settle()
    expect(order).toEqual(["read"])
    clock.pass(3 * MS_PER_REQUEST)
    await Promise.all([read, ...drain])
    expect(order).toEqual(["read", "drain 0", "drain 1", "drain 2"])
  })

  it("lets one side's waiting turns go, and keeps the other's", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    await Promise.all(Array.from({ length: BURST }, () => pace.turn(false)))
    const drain = pace.turn(false)
    const read = pace.turn(true)
    pace.leave(false)
    await expect(drain).resolves.toBe(false)
    clock.pass(MS_PER_REQUEST)
    await expect(read).resolves.toBe(true)
  })

  it("after home's 429, has no burst left: what waits goes one each 2 s (HERD1)", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    await pace.turn(false)
    pace.spend(null)
    let went = 0
    const herd = Array.from({ length: 5 }, () =>
      pace.turn(false).then(() => {
        went += 1
      })
    )
    await settle()
    expect(went).toBe(0)
    for (let n = 1; n <= 5; n += 1) {
      clock.pass(MS_PER_REQUEST)
      await settle()
      expect(went).toBe(n)
    }
    await Promise.all(herd)
  })

  it("is kept across page loads: a page opened right after a burst gets no new one (HERD1)", async () => {
    const kept = memory()
    const clock = fakeClock(1_000_000)
    const first = createPace(clock, kept)
    await Promise.all(Array.from({ length: BURST }, () => first.turn(false)))
    // The app closed and opened again, a second later.
    clock.pass(1_000)
    const second = createPace(clock, kept)
    let went = 0
    const turns = Array.from({ length: 3 }, () =>
      second.turn(false).then(() => {
        went += 1
      })
    )
    await settle()
    expect(went).toBe(0)
    clock.pass(MS_PER_REQUEST)
    await settle()
    expect(went).toBe(1)
    clock.pass(2 * MS_PER_REQUEST)
    await Promise.all(turns)
    // A page opened long after finds the burst whole again, and no more.
    clock.pass(600_000)
    const third = createPace(clock, kept)
    let later = 0
    void Promise.all(
      Array.from({ length: BURST + 1 }, () =>
        third.turn(false).then(() => {
          later += 1
        })
      )
    )
    await settle()
    expect(later).toBe(BURST)
  })

  it("trusts nothing odd kept: a clock set back, more turns than the burst, or no number", async () => {
    const clock = fakeClock(1_000)
    const odd = memory()
    odd.kept = { turns: 500, at: 9_999_999 }
    const pace = createPace(clock, odd)
    let went = 0
    void Promise.all(
      Array.from({ length: BURST + 1 }, () =>
        pace.turn(false).then(() => {
          went += 1
        })
      )
    )
    await settle()
    expect(went).toBe(BURST)

    const store = new Map<string, string>()
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value)
      },
    }
    const stored = storedPace(storage)
    expect(stored?.read()).toBeNull()
    store.set("home-link:pace", "{not json")
    expect(stored?.read()).toBeNull()
    store.set("home-link:pace", JSON.stringify({ turns: "3", at: 1 }))
    expect(stored?.read()).toBeNull()
    stored?.write({ turns: 3, at: 1 })
    expect(stored?.read()).toEqual({ turns: 3, at: 1 })
    expect(storedPace(null)).toBeNull()
  })

  it("after home's 429, keeps to home's own rate: Retry-After added between requests, the burst as much smaller, for a day (HERD1)", async () => {
    const kept = memory()
    const clock = fakeClock(1_000_000)
    const pace = createPace(clock, kept)
    await pace.turn(false)
    // Home (RATE_LIMIT 10: one back each 6 s) fell 4 s short; a 2 s pace
    // learns at most 2 s more (4 s), and the next 429 the rest.
    pace.spend(4_000)
    pace.spend(2_000)
    let went = 0
    const take = (): Promise<void> =>
      pace.turn(false).then(() => {
        went += 1
      })
    const two = [take(), take()]
    clock.pass(MS_PER_REQUEST)
    await settle()
    expect(went).toBe(0)
    clock.pass(6_000 - MS_PER_REQUEST)
    await settle()
    expect(went).toBe(1)
    clock.pass(6_000)
    await Promise.all(two)
    expect(went).toBe(2)
    // Left alone, the burst refills only to its share of home's smaller bucket.
    clock.pass(3_600_000)
    const page = createPace(clock, kept)
    let burst = 0
    void Promise.all(
      Array.from({ length: BURST }, () =>
        page.turn(false).then(() => {
          burst += 1
        })
      )
    )
    await settle()
    expect(burst).toBe(Math.floor((BURST * MS_PER_REQUEST) / 6_000))
    page.leave(false)
    // A day on, it is home's default pace again.
    clock.pass(24 * 3_600_000)
    const later = createPace(clock, kept)
    let whole = 0
    void Promise.all(
      Array.from({ length: BURST }, () =>
        later.turn(false).then(() => {
          whole += 1
        })
      )
    )
    await settle()
    expect(whole).toBe(BURST)
  })
})

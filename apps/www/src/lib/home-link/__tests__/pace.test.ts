/**
 * The one pace every request to home takes a turn on (AD3, `../pace`).
 */
import { fakeClock } from "@/test-support/fake-clock"
import { describe, expect, it } from "vitest"

import { createPace } from "@/lib/home-link/pace"

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe("the pace", () => {
  it("paces every request so that, in one page load, the phone never takes home's bucket below 11: 49 at once, then one each 2 s, whoever asks (AD3)", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    // Home's bucket as file_host keeps it: 60, one back each second.
    let bucket = 60
    let filled = 0
    let lowest = bucket
    let went = 0
    const take = (urgent: boolean): Promise<void> =>
      pace.turn(urgent).then(() => {
        bucket = Math.min(60, bucket + (clock.now() - filled) / 1_000) - 1
        filled = clock.now()
        lowest = Math.min(lowest, bucket)
        went += 1
      })
    const pass = async (ms: number): Promise<void> => {
      clock.pass(ms)
      await settle()
    }
    const turns = Array.from({ length: 52 }, (_, i) => take(i % 3 === 0))
    await settle()
    expect(went).toBe(49)
    await pass(1_999)
    expect(went).toBe(49)
    await pass(1)
    expect(went).toBe(50)
    await pass(4_000)
    expect(went).toBe(52)
    await Promise.all(turns)
    // Left alone, it refills to the burst and no further.
    await pass(600_000)
    const again = Array.from({ length: 50 }, (_, i) => take(i % 2 === 0))
    await settle()
    expect(went).toBe(52 + 49)
    await pass(2_000)
    await Promise.all(again)
    expect(lowest).toBeGreaterThanOrEqual(11)
  })

  it("gives the person's turn ahead of every drain turn waiting", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    const order: Array<string> = []
    const burst = Array.from({ length: 49 }, () => pace.turn(false))
    await Promise.all(burst)
    const drain = Array.from({ length: 3 }, (_, i) =>
      pace.turn(false).then(() => order.push(`drain ${String(i)}`))
    )
    const read = pace.turn(true).then(() => order.push("read"))
    clock.pass(2_000)
    await settle()
    expect(order).toEqual(["read"])
    clock.pass(6_000)
    await Promise.all([read, ...drain])
    expect(order).toEqual(["read", "drain 0", "drain 1", "drain 2"])
  })

  it("lets one side's waiting turns go, and keeps the other's", async () => {
    const clock = fakeClock()
    const pace = createPace(clock)
    await Promise.all(Array.from({ length: 49 }, () => pace.turn(false)))
    const drain = pace.turn(false)
    const read = pace.turn(true)
    pace.leave(false)
    await expect(drain).resolves.toBe(false)
    clock.pass(2_000)
    await expect(read).resolves.toBe(true)
  })
})

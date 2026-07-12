import { describe, expect, it } from "vitest"

import type { SensedToken } from "./observer"
import { createPollChannel } from "./polling"

type Attrs = { readonly text: string }

describe("sensor/polling — createPollChannel", () => {
  it("re-samples every key in the holding set and emits epoch-tagged tokens", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createPollChannel<string, Attrs>({
      holdingSet: () => ["a", "b"],
      resample: (key) => ({ key, attrs: { text: key }, timestamp: 1 }),
      currentEpoch: () => 2,
      emit: (token) => emitted.push(token),
    })

    const count = channel.poll()

    expect(count).toBe(2)
    expect(emitted).toHaveLength(2)
    expect(emitted.every((t) => t.epoch === 2)).toBe(true)
  })

  it("skips keys the resampler has nothing new for", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createPollChannel<string, Attrs>({
      holdingSet: () => ["a", "b"],
      resample: (key) =>
        key === "a" ? { key, attrs: { text: key }, timestamp: 1 } : undefined,
      currentEpoch: () => 0,
      emit: (token) => emitted.push(token),
    })

    const count = channel.poll()

    expect(count).toBe(1)
    expect(emitted[0]?.key).toBe("a")
  })

  it("re-derives the holding set fresh on every poll() call", () => {
    let generation = 0
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createPollChannel<string, Attrs>({
      holdingSet: () => {
        generation++
        return generation === 1 ? ["a"] : ["a", "b"]
      },
      resample: (key) => ({ key, attrs: { text: key }, timestamp: 1 }),
      currentEpoch: () => 0,
      emit: (token) => emitted.push(token),
    })

    channel.poll()
    channel.poll()

    expect(emitted).toHaveLength(3)
  })

  it("hard-codes no cadence — poll() only runs when called, never on a timer of its own", () => {
    let calls = 0
    const channel = createPollChannel<string, Attrs>({
      holdingSet: () => [],
      resample: () => undefined,
      currentEpoch: () => {
        calls++
        return 0
      },
      emit: () => {},
    })

    expect(calls).toBe(0)
    channel.poll()
    expect(calls).toBe(1)
  })
})

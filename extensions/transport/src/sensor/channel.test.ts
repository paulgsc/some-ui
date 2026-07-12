import { describe, expect, it } from "vitest"

import { createHybridChannel } from "./channel"
import type { SensedToken } from "./observer"

type Attrs = { readonly text: string }

function token(
  key: string,
  timestamp: number,
  epoch: number
): SensedToken<string, Attrs> {
  return { key, attrs: { text: key }, timestamp, epoch }
}

describe("sensor/channel — createHybridChannel", () => {
  it("merges pushes from both sub-channels into one queue (SS = SS_event ∪ SS_poll)", () => {
    const channel = createHybridChannel<string, Attrs>()

    channel.queue.push(token("from-event", 1, 0))
    channel.queue.push(token("from-poll", 2, 0))

    expect(channel.queue.length).toBe(2)
  })

  it("drain() returns tokens in arrival order and empties the queue", () => {
    const channel = createHybridChannel<string, Attrs>()
    channel.queue.push(token("a", 1, 0))
    channel.queue.push(token("b", 2, 0))

    const drained = channel.queue.drain()

    expect(drained.map((t) => t.key)).toEqual(["a", "b"])
    expect(channel.queue.length).toBe(0)
  })

  it("makes no attempt to reorder or deduplicate — that is the Estimator's job (§8 stage separation)", () => {
    const channel = createHybridChannel<string, Attrs>()
    channel.queue.push(token("k", 5, 0))
    channel.queue.push(token("k", 1, 0))
    channel.queue.push(token("k", 5, 0))

    const drained = channel.queue.drain()

    expect(drained.map((t) => t.timestamp)).toEqual([5, 1, 5])
  })
})

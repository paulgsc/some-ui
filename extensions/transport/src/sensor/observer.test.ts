import { describe, expect, it } from "vitest"

import type { Token } from "../contracts/token"
import {
  attachDomEventListener,
  attachMutationObserver,
  createEventChannel,
  type SensedToken,
} from "./observer"

type Attrs = { readonly text: string }

describe("sensor/observer — createEventChannel", () => {
  it("emits tokens tagged with the current epoch", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createEventChannel<string, string, Attrs>({
      toTokens: (raw) => [{ key: raw, attrs: { text: raw }, timestamp: 1 }],
      currentEpoch: () => 7,
      emit: (token) => emitted.push(token),
    })

    channel.ingest("k1")

    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.epoch).toBe(7)
    expect(emitted[0]?.key).toBe("k1")
  })

  it("excludes self-authored payloads before producing any token (Axiom 3.5)", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createEventChannel<string, string, Attrs>({
      toTokens: (raw) => [{ key: raw, attrs: { text: raw }, timestamp: 1 }],
      currentEpoch: () => 0,
      isSelfAuthored: (raw) => raw.startsWith("self:"),
      emit: (token) => emitted.push(token),
    })

    channel.ingest("self:k1")
    channel.ingest("vendor:k1")

    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.key).toBe("vendor:k1")
  })

  it("does not interpret token content — a raw payload producing zero tokens emits nothing", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const channel = createEventChannel<string, string, Attrs>({
      toTokens: () => [],
      currentEpoch: () => 0,
      emit: (token) => emitted.push(token),
    })

    channel.ingest("anything")

    expect(emitted).toHaveLength(0)
  })

  it("a single raw payload may fan out into multiple tokens, all tagged with the same epoch", () => {
    const emitted: Array<SensedToken<string, Attrs>> = []
    const tokens: Array<Token<string, Attrs>> = [
      { key: "a", attrs: { text: "a" }, timestamp: 1 },
      { key: "b", attrs: { text: "b" }, timestamp: 2 },
    ]
    const channel = createEventChannel<string, string, Attrs>({
      toTokens: () => tokens,
      currentEpoch: () => 3,
      emit: (token) => emitted.push(token),
    })

    channel.ingest("batch")

    expect(emitted).toHaveLength(2)
    expect(emitted.every((t) => t.epoch === 3)).toBe(true)
  })
})

describe("sensor/observer — DOM wiring", () => {
  it("attachMutationObserver feeds MutationRecords into the channel and disconnects on dispose", async () => {
    const target = document.createElement("div")
    document.body.appendChild(target)

    const ingested: Array<MutationRecord> = []
    const channel = {
      ingest: (raw: MutationRecord): void => {
        ingested.push(raw)
      },
    }

    const dispose = attachMutationObserver(target, channel, {
      attributes: true,
    })

    target.setAttribute("data-x", "1")
    await Promise.resolve() // MutationObserver callbacks are microtask-scheduled
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))

    expect(ingested.length).toBeGreaterThan(0)

    dispose()
    target.remove()
  })

  it("attachDomEventListener feeds events into the channel and removes the listener on dispose", () => {
    const target = document.createElement("div")
    const ingested: Array<Event> = []
    const channel = {
      ingest: (raw: Event): void => {
        ingested.push(raw)
      },
    }

    const dispose = attachDomEventListener(target, "click", channel)

    target.dispatchEvent(new Event("click"))
    expect(ingested).toHaveLength(1)

    dispose()
    target.dispatchEvent(new Event("click"))
    expect(ingested).toHaveLength(1)
  })
})

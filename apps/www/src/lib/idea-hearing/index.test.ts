/** @vitest-environment node */
import type { IdeaListener, Listened, Listening } from "@some-ui/soundbites"
import { describe, expect, it, vi } from "vitest"

import { eitherListener } from "@/lib/idea-hearing"

/** A listener that says who it is in what it hears. */
function fake(
  name: string,
  available: boolean
): IdeaListener & {
  listened: Array<unknown>
} {
  const listened: Array<unknown> = []
  return {
    listened,
    available: () => Promise.resolve(available),
    listen: (...args): Listening => {
      listened.push(args)
      return {
        done: Promise.resolve<Listened>({ kind: "heard", words: name }),
        stop: () => undefined,
        cancel: () => undefined,
      }
    },
  }
}

describe("IH1: where an idea answer's words come from", () => {
  it("hears through home on a paired phone, whatever the phone's recognizer can do", async () => {
    const home = fake("home", true)
    const device = fake("device", false)
    const listener = eitherListener({
      loaded: () => Promise.resolve(),
      paired: () => true,
      home,
      device,
    })
    expect(await listener.available()).toBe(true)
    const take = { answers: "idea:i1:what", onHearing: vi.fn() }
    const words = vi.fn()
    const ready = vi.fn()
    expect(await listener.listen(words, ready, take).done).toEqual({
      kind: "heard",
      words: "home",
    })
    expect(home.listened).toEqual([[words, ready, take]])
    expect(device.listened).toEqual([])
  })

  it("listens through the phone's recognizer, as before, on a phone not paired", async () => {
    const home = fake("home", true)
    const device = fake("device", false)
    const listener = eitherListener({
      loaded: () => Promise.resolve(),
      paired: () => false,
      home,
      device,
    })
    expect(await listener.available()).toBe(false)
    expect(await listener.listen(vi.fn(), vi.fn()).done).toEqual({
      kind: "heard",
      words: "device",
    })
    expect(home.listened).toEqual([])
    expect(device.listened).toHaveLength(1)
  })

  it("asks whether it can talk only once the pairing has been read", async () => {
    let paired = false
    let loaded: () => void = () => undefined
    const listener = eitherListener({
      loaded: () =>
        new Promise<void>((resolve) => {
          loaded = (): void => {
            paired = true
            resolve()
          }
        }),
      paired: () => paired,
      home: fake("home", true),
      device: fake("device", false),
    })
    const available = listener.available()
    loaded()
    expect(await available).toBe(true)
  })
})

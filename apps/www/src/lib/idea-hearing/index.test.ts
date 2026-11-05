/** @vitest-environment node */
import type { Listened, Listening, TurnListener } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import { AWAY_MS, eitherListener, reachOf } from "@/lib/idea-hearing"

/** A listener that says who it is in what it hears, unless told otherwise. */
function fake(
  name: string,
  available: boolean,
  result: Listened = { kind: "heard", words: name }
): TurnListener & {
  listened: Array<unknown>
} {
  const listened: Array<unknown> = []
  return {
    listened,
    available: () => Promise.resolve(available),
    listen: (...args): Listening => {
      listened.push(args)
      return {
        done: Promise.resolve<Listened>(result),
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
      pairing: () => "p1",
      home,
      device,
      now: () => 0,
    })
    expect(await listener.available()).toBe(true)
    const take = {
      answers: "idea:i1:what",
      onHearing: vi.fn(),
    }
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
      pairing: () => null,
      home,
      device,
      now: () => 0,
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
      pairing: () => (paired ? "p1" : null),
      home: fake("home", true),
      device: fake("device", false),
      now: () => 0,
    })
    const available = listener.available()
    loaded()
    expect(await available).toBe(true)
  })

  it.each([true, false])(
    "once home doesn't answer, skips it for a while: the recognizer hears, or typing (recognizer: %s)",
    async (recognizer) => {
      let now = 1_000
      const home = fake("home", true, {
        kind: "kept",
        on: "phone",
        why: "away",
      })
      const device = fake("device", recognizer)
      const listener = eitherListener({
        loaded: () => Promise.resolve(),
        pairing: () => "p1",
        home,
        device,
        now: () => now,
      })
      expect(await listener.listen(vi.fn(), vi.fn()).done).toMatchObject({
        why: "away",
      })
      // What the screen asks next, as it does once home didn't answer.
      expect(await listener.available()).toBe(recognizer)
      await listener.listen(vi.fn(), vi.fn()).done
      expect(home.listened).toHaveLength(1)
      expect(device.listened).toHaveLength(1)
      now += AWAY_MS
      expect(await listener.available()).toBe(true)
      await listener.listen(vi.fn(), vi.fn()).done
      expect(home.listened).toHaveLength(2)
    }
  )

  it("keeps hearing through home when the take's words were only late", async () => {
    const home = fake("home", true, { kind: "kept", on: "home", why: "late" })
    const device = fake("device", false)
    const listener = eitherListener({
      loaded: () => Promise.resolve(),
      pairing: () => "p1",
      home,
      device,
      now: () => 0,
    })
    await listener.listen(vi.fn(), vi.fn()).done
    expect(await listener.available()).toBe(true)
    await listener.listen(vi.fn(), vi.fn()).done
    expect(home.listened).toHaveLength(2)
    expect(device.listened).toEqual([])
  })

  it("tries home again at once when the phone is paired anew within the window", async () => {
    let pairing = "p1"
    const home = fake("home", true, { kind: "kept", on: "phone", why: "away" })
    const device = fake("device", false)
    const listener = eitherListener({
      loaded: () => Promise.resolve(),
      pairing: () => pairing,
      home,
      device,
      now: () => 0,
    })
    await listener.listen(vi.fn(), vi.fn()).done
    expect(await listener.available()).toBe(false)
    pairing = "p2"
    expect(await listener.available()).toBe(true)
    await listener.listen(vi.fn(), vi.fn()).done
    expect(home.listened).toHaveLength(2)
    expect(device.listened).toEqual([])
  })
})

describe("where a new idea goes (ST26 b)", () => {
  it("is away while the voice lane's last run found home out of reach, near otherwise, unpaired with no pairing, and unknown while the pairing is being read", () => {
    const paired = {
      kind: "paired",
      base: "https://home.lan",
      id: "p1",
      notForgotten: false,
    } as const
    const unpaired = { kind: "unpaired", note: null } as const
    expect(reachOf(unpaired, { kind: "unreachable", at: 1 })).toBe("unpaired")
    expect(reachOf(paired, { kind: "unreachable", at: 1 })).toBe("away")
    expect(reachOf(paired, { kind: "synced", at: 2 })).toBe("near")
    expect(reachOf(paired, { kind: "failed", why: "room" })).toBe("near")
    expect(reachOf(paired, null)).toBe("near")
    // A paired phone never says it isn't while its record is read (ST34).
    expect(reachOf({ kind: "reading" }, null)).toBe("unknown")
    expect(reachOf({ kind: "reading" }, { kind: "unreachable", at: 1 })).toBe(
      "unknown"
    )
  })
})

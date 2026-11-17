/**
 * @vitest-environment jsdom
 *
 * SIGNIN2 (#3088): which phones open on the welcome, by what the link read
 * and what the person said on this phone.
 */
import { afterEach, describe, expect, it } from "vitest"

import type { Seen } from "@/lib/home-link/first-run"
import {
  firstRun,
  mayOpen,
  restored,
  seenHere,
  watchPairing,
} from "@/lib/home-link/first-run"
import type {
  HomeLinkEvent,
  HomeLinkState,
  UnpairedNote,
} from "@/lib/home-link/model"
import { INITIAL, step } from "@/lib/home-link/model"

const read = (
  found: Extract<HomeLinkEvent, { type: "read" }>["found"]
): HomeLinkState => step(INITIAL, { type: "read", found })

const unpaired = (note: UnpairedNote | null): HomeLinkState => ({
  ...INITIAL,
  link: { kind: "unpaired", note },
})

const SEEN: ReadonlyArray<Seen> = [
  "",
  "welcome",
  "restored",
  "paired",
  "unpaired",
]

describe("the first run's welcome", () => {
  it("opens on a phone never paired, until the person says Not now or it is paired", () => {
    expect(firstRun(read(null), "")).toBe(true)
    expect(firstRun(read(null), "welcome")).toBe(false)
    expect(firstRun(unpaired("unreadable"), "")).toBe(true)
    expect(firstRun(unpaired("unreadable"), "welcome")).toBe(false)
    // Unpaired by the person and restarted: the record reads as never
    // paired, and what the phone remembers keeps the welcome away.
    expect(firstRun(read(null), "unpaired")).toBe(false)
    expect(firstRun(unpaired("unreadable"), "unpaired")).toBe(false)
    // A record there but not read just now, on a phone that remembers a
    // pairing: no reason to pair again.
    expect(firstRun(unpaired("unreadable"), "paired")).toBe(false)
    expect(restored(unpaired("unreadable"), "paired")).toBe(false)
  })

  it("opens after a restore lost the pairing, whatever was said before it, until Not now is said to that", () => {
    for (const said of SEEN) {
      expect(firstRun(read("lost"), said)).toBe(said !== "restored")
      expect(restored(read("lost"), said)).toBe(true)
    }
  })

  it("takes a pairing remembered with no record for a restore or a move to a new phone", () => {
    expect(firstRun(read(null), "paired")).toBe(true)
    expect(restored(read(null), "paired")).toBe(true)
    // "Not now" said to that, then restarted.
    expect(firstRun(read(null), "restored")).toBe(false)
    for (const said of SEEN.filter((s) => s !== "paired")) {
      expect(restored(read(null), said)).toBe(false)
    }
  })

  it("waits for the record only where the welcome may open", () => {
    expect(SEEN.filter(mayOpen)).toEqual(["", "paired"])
  })

  it("never opens while the record is read, on a paired phone, or one the person just unpaired", () => {
    for (const said of SEEN) {
      expect(firstRun(INITIAL, said)).toBe(false)
      expect(
        firstRun(read({ base: "https://h/api/v1", id: "p", since: null }), said)
      ).toBe(false)
      expect(firstRun(unpaired("unpaired"), said)).toBe(false)
      expect(firstRun(unpaired("unpaired-offline"), said)).toBe(false)
    }
  })
})

describe("what the phone keeps of its pairing", () => {
  afterEach(() => localStorage.clear())

  /** A link whose state the test sets, and tells its listeners of. */
  function link(first: HomeLinkState): {
    getSnapshot: () => HomeLinkState
    subscribe: (listener: () => void) => () => void
    set: (next: HomeLinkState) => void
  } {
    let state = first
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set: (next): void => {
        state = next
        for (const listener of listeners) listener()
      },
    }
  }

  const PAIRED = read({ base: "https://h/api/v1", id: "p", since: null })

  it("remembers a pairing and an unpair, and nothing else the link says", () => {
    const fake = link(INITIAL)
    const stop = watchPairing(fake)
    expect(seenHere()).toBe("")
    fake.set(read(null))
    expect(seenHere()).toBe("")
    fake.set(PAIRED)
    expect(seenHere()).toBe("paired")
    fake.set(unpaired("unpaired-offline"))
    expect(seenHere()).toBe("unpaired")
    fake.set(PAIRED)
    stop()
    fake.set(unpaired("unpaired"))
    expect(seenHere()).toBe("paired")
  })

  it("takes back an unpair remembered as it was pressed, once the link stays paired", () => {
    localStorage.setItem("some-ui.home.welcome-not-now.v1", "unpaired")
    const stop = watchPairing(link(PAIRED))
    expect(seenHere()).toBe("paired")
    stop()
  })

  it("leaves what was said to the welcome while nothing is paired", () => {
    localStorage.setItem("some-ui.home.welcome-not-now.v1", "restored")
    const stop = watchPairing(link(read("lost")))
    expect(seenHere()).toBe("restored")
    stop()
  })
})

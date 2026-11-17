/**
 * SIGNIN2 (#3088): which phones open on the welcome, by what the link read
 * and what the person said on this phone.
 */
import { describe, expect, it } from "vitest"

import type { Seen } from "@/lib/home-link/first-run"
import { firstRun, restored } from "@/lib/home-link/first-run"
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

const SEEN: ReadonlyArray<Seen> = ["", "welcome", "restored", "paired"]

describe("the first run's welcome", () => {
  it("opens on a phone never paired, until the person says Not now or it is paired", () => {
    expect(firstRun(read(null), "")).toBe(true)
    expect(firstRun(read(null), "welcome")).toBe(false)
    expect(firstRun(unpaired("unreadable"), "")).toBe(true)
    expect(firstRun(unpaired("unreadable"), "welcome")).toBe(false)
    // Unpaired by the person and restarted: the record reads as never
    // paired, and what the phone remembers keeps the welcome away.
    expect(firstRun(read(null), "paired")).toBe(false)
    expect(firstRun(unpaired("unreadable"), "paired")).toBe(false)
  })

  it("opens after a restore lost the pairing, whatever was said before it, until Not now is said to that", () => {
    expect(firstRun(read("lost"), "")).toBe(true)
    expect(firstRun(read("lost"), "welcome")).toBe(true)
    expect(firstRun(read("lost"), "paired")).toBe(true)
    expect(firstRun(read("lost"), "restored")).toBe(false)
    expect(restored(read("lost"))).toBe(true)
    expect(restored(read(null))).toBe(false)
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

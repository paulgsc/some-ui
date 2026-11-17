/**
 * SIGNIN2 (#3088): which phones open on the welcome, by what the link read
 * and what the person said on this phone.
 */
import { describe, expect, it } from "vitest"

import type { NotNow } from "@/lib/home-link/first-run"
import { firstRun } from "@/lib/home-link/first-run"
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

const SAID: ReadonlyArray<NotNow> = ["", "welcome", "restored"]

describe("the first run's welcome", () => {
  it("opens on a phone never paired, until the person says Not now", () => {
    expect(firstRun(read(null), "")).toBe(true)
    expect(firstRun(read(null), "welcome")).toBe(false)
    expect(firstRun(unpaired("unreadable"), "")).toBe(true)
    expect(firstRun(unpaired("unreadable"), "welcome")).toBe(false)
  })

  it("opens after a restore lost the pairing, whatever was said before it, until Not now is said to that", () => {
    expect(firstRun(read("lost"), "")).toBe(true)
    expect(firstRun(read("lost"), "welcome")).toBe(true)
    expect(firstRun(read("lost"), "restored")).toBe(false)
  })

  it("never opens while the record is read, on a paired phone, or one the person just unpaired", () => {
    for (const said of SAID) {
      expect(firstRun(INITIAL, said)).toBe(false)
      expect(
        firstRun(read({ base: "https://h/api/v1", id: "p", since: null }), said)
      ).toBe(false)
      expect(firstRun(unpaired("unpaired"), said)).toBe(false)
      expect(firstRun(unpaired("unpaired-offline"), said)).toBe(false)
    }
  })
})

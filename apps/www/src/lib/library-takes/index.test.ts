/**
 * @vitest-environment jsdom
 *
 * The phone's takes with no scene (ST32): each short enough that home keeps
 * it, and a snapshot that is the same object while nothing changed.
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import { describe, expect, it } from "vitest"

import { libraryTakes } from "@/lib/library-takes"
import { NOTE_CEILING } from "@/lib/voice-home/home"

describe("takes with no scene on the phone (ST32)", () => {
  it("lets a ramble run three minutes, still under what home keeps one note at", () => {
    const { maxMs } = libraryTakes().pattern.options.limits
    expect(maxMs).toBe(180_000)
    expect((maxMs / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)).toBeLessThan(
      NOTE_CEILING
    )
  })

  it("gives the same snapshot while nothing changed, and the same port", () => {
    const phone = libraryTakes()
    const first = phone.getSnapshot()
    expect(phone.getSnapshot()).toBe(first)
    expect(first).toEqual({ takes: [], full: false })
    expect(libraryTakes()).toBe(phone)
  })
})

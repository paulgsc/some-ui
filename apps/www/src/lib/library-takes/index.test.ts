/**
 * @vitest-environment jsdom
 *
 * The phone's takes with no scene (ST32), as Takes on home records and
 * lists them: many beside each other, the desk making room at its cap
 * (HF5), each short enough that home keeps it, and a snapshot that is the
 * same object while nothing changed.
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import { describe, expect, it } from "vitest"

import { libraryTakes } from "@/lib/library-takes"

/** The most bytes home keeps one voice note at (paulgsc/server `NOTE_CEILING`). */
const HOME_NOTE_CEILING = 1024 * 1024

describe("takes with no scene on the phone (ST32)", () => {
  it("keeps many beside each other, makes room at the cap, and plays each", () => {
    const { pattern, line } = libraryTakes()
    expect(line).toBe("library")
    expect(pattern.options.takes).toEqual({
      per: "many",
      max: 40,
      full: "make-room",
    })
    expect(pattern.options.play).toBe("each")
  })

  it("lets a ramble run three minutes, still under what home keeps one note at", () => {
    const { maxMs } = libraryTakes().pattern.options.limits
    expect(maxMs).toBe(180_000)
    expect((maxMs / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)).toBeLessThan(
      HOME_NOTE_CEILING
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

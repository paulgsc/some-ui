/**
 * The takes desk as Rust Rounds' microphone: its sentences, written for a
 * tap recorder, reach the session as how a take ended or why none started,
 * never as the desk's own words.
 */
import { RECORDING_FAILURE_COPY, VOICE_NOTE_SAID } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import { translate } from "@/lib/rust-rounds"

vi.mock("@/lib/takes-desk", () => ({
  takesDesk: (): object => ({ phone: vi.fn(), sweep: vi.fn() }),
}))

describe("translate", () => {
  it("reads each way a take ends", () => {
    for (const [end, said] of Object.entries(VOICE_NOTE_SAID)) {
      expect(translate(said)).toEqual({ ended: end, blocked: null })
    }
  })

  it("passes on why the microphone did not start, as said", () => {
    expect(translate(RECORDING_FAILURE_COPY.denied)).toEqual({
      ended: null,
      blocked: RECORDING_FAILURE_COPY.denied,
    })
  })

  it("says nothing when the desk says nothing", () => {
    expect(translate(null)).toEqual({ ended: null, blocked: null })
  })
})

/**
 * The takes desk as Rust Rounds' microphone: how each take ended reaches
 * the session as the desk's own end, and why the microphone refused in the
 * person's words, never as a sentence read back.
 */
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import { noteView } from "@/lib/rust-rounds"
import type { DeskSnapshot } from "@/lib/takes-desk"

vi.mock("@/lib/takes-desk", () => ({
  takesDesk: (): object => ({ phone: vi.fn(), sweep: vi.fn() }),
}))

const AT_REST: DeskSnapshot = {
  take: { kind: "idle" },
  said: null,
  last: null,
  kept: null,
  playing: false,
  full: false,
  ended: null,
  blocked: null,
}

describe("noteView", () => {
  it("passes each take's end on, with the note it kept", () => {
    expect(
      noteView({
        ...AT_REST,
        said: null,
        ended: { seq: 3, line: "rust-rounds:a/b", end: "kept", id: "n1" },
      })
    ).toEqual({
      take: { kind: "idle" },
      ended: { seq: 3, line: "rust-rounds:a/b", end: "kept", note: "n1" },
      blocked: null,
    })
  })

  it("says why the microphone refused, in the person's words", () => {
    expect(noteView({ ...AT_REST, blocked: "denied" }).blocked).toBe(
      RECORDING_FAILURE_COPY.denied
    )
  })

  it("shows a take under way without how long it has run", () => {
    expect(
      noteView({ ...AT_REST, take: { kind: "recording", elapsedMs: 4_000 } })
        .take
    ).toEqual({ kind: "recording" })
  })
})

/**
 * The takes desk as Rust Rounds' microphone: how each take ended reaches
 * the session as the desk's own end, and why the microphone refused in the
 * person's words, never as a sentence read back.
 */
import type { Playback, Recording } from "@some-ui/voice-capture"
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import { noteView } from "@/lib/rust-rounds"
import type { DeskSnapshot } from "@/lib/takes-desk"
import { createTakes } from "@/lib/takes-desk/runtime"

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

  it("passes on a take the real desk ended before the microphone opened, which the session says (VC2)", async () => {
    let open: (mic: Recording) => void = () => undefined
    const discard = vi.fn()
    const takes = createTakes(
      {
        startRecording: (): Promise<Recording> =>
          new Promise((resolve) => (open = resolve)),
        audio: {
          put: () => Promise.resolve(),
          get: () => Promise.resolve(null),
          remove: () => Promise.resolve(),
          ids: () => Promise.resolve([]),
        },
        takes: { read: () => [], add: () => true, remove: () => true },
        saving: () => undefined,
        player: {
          play: (): Playback => ({
            ended: Promise.resolve(),
            stop: () => undefined,
          }),
        },
        now: () => 0,
        newId: () => "n1",
      },
      { max: Number.POSITIVE_INFINITY, maxMs: 60_000 }
    )
    // A press and a quick release, as on the owner's screen recording.
    takes.start("rust-rounds:indexing-01/a")
    expect(noteView(takes.getSnapshot()).take).toEqual({ kind: "opening" })
    takes.stop()
    open({
      level: () => 0,
      finish: () => Promise.reject(new Error("never asked")),
      discard,
    })
    await vi.waitFor(() => expect(discard).toHaveBeenCalledOnce())
    expect(noteView(takes.getSnapshot())).toEqual({
      take: { kind: "idle" },
      ended: {
        seq: 1,
        line: "rust-rounds:indexing-01/a",
        end: "early",
        note: null,
      },
      blocked: null,
    })
  })
})

import { noteOfTranscript } from "@rust-rounds/lib/monday/mailbox"
import { describe, expect, it } from "vitest"

describe("the routine's mailbox", () => {
  it("reads the note a transcript's name carries", () => {
    expect(noteOfTranscript("transcript-note-311-12.json")).toBe("note-311")
    expect(noteOfTranscript("rust-week-2026-w46.json")).toBeNull()
  })
})

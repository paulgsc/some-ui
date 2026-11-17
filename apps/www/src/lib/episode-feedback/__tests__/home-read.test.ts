/**
 * @vitest-environment node
 *
 * PO1 (#3157): what Studio's Feedback page says home holds of each note is
 * not known while the pairing record is read, and never said as none.
 */
import { describe, expect, it, vi } from "vitest"

import type { Pairing } from "@/lib/home-link"

const link = vi.hoisted((): { now: Pairing } => ({ now: { kind: "reading" } }))

vi.mock("@/lib/home-link", () => ({ pairing: (): Pairing => link.now }))

const { notesAnswered } = await import("@/lib/episode-feedback/home-read")

describe("what home holds of each note (PO1)", () => {
  it("is not known while the pairing record is read", () => {
    link.now = { kind: "reading" }
    expect(notesAnswered()).toBeNull()
  })

  it("is known, and empty, once the record says this phone isn't paired", () => {
    link.now = { kind: "unpaired" }
    expect(notesAnswered()).toEqual({ held: new Set(), refused: new Set() })
  })

  it("is known once the record says this phone is paired", () => {
    link.now = { kind: "paired", id: "p1" }
    expect(notesAnswered()).not.toBeNull()
  })
})

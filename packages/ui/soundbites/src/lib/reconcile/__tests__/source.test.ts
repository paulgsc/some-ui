/** @vitest-environment node */
import { sourceOf } from "@soundbites/lib/reconcile/source"
import { describe, expect, it } from "vitest"

describe("where a take can be said again from (#3339)", () => {
  it("leads a spoken card's take to its part", () => {
    expect(sourceOf({ of: "studio", ref: "spoken:scabc12.2" })).toEqual({
      kind: "spoken",
      card: "scabc12",
      part: 2,
    })
  })

  it("leads an interview take to its question, or to the card it reads", () => {
    expect(sourceOf({ of: "interview", ref: "2026-w46:a-time-you" })).toEqual({
      kind: "question",
      question: "a-time-you",
    })
    expect(
      sourceOf({ of: "interview", ref: "2026-w46:read:rust-ch4" })
    ).toEqual({ kind: "read", card: "rust-ch4" })
    expect(sourceOf({ of: "interview", ref: "2026-w46" })).toBeNull()
    expect(sourceOf({ of: "interview", ref: "2026-w46:read:" })).toBeNull()
  })

  it("leads nowhere from a take with no page to say it again from", () => {
    for (const take of [
      { of: "studio", ref: "take:abc" },
      { of: "studio", ref: "ep04:s3:2" },
      { of: "game", ref: "401772" },
      { of: "reflection", ref: "session-7f2a" },
      { of: "rust-round", ref: "2026-w46:QM-311" },
      { of: "newer", ref: "spoken:scabc12.2" },
    ])
      expect(sourceOf(take)).toBeNull()
  })
})

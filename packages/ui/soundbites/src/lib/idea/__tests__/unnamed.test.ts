/**
 * @vitest-environment node
 *
 * ST26 (#2483): a new idea's waiting takes that neither the draft nor any
 * idea kept names, and only those.
 */
import type { PatternTake } from "@some-ui/voice-capture"
import {
  answersOf,
  IDEA_LISTS_SEED,
  newDraft,
} from "@soundbites/lib/idea/draft"
import { unnamedTakes } from "@soundbites/lib/idea/unnamed"
import { describe, expect, it } from "vitest"

import { AT, caught } from "./fixture"

const take = (id: string, answers: string, waits = true): PatternTake => ({
  id,
  answers,
  durationMs: 1000,
  recordedAt: AT,
  standing: "current",
  kept: { place: "phone" },
  ...(waits ? { waits: true as const } : {}),
})

const draft = newDraft("draft-1", AT, IDEA_LISTS_SEED)
const kept = [caught("idea-1")]

describe("unnamedTakes", () => {
  it("names a waiting take whose idea is neither the draft nor kept", () => {
    const takes = [
      take("t1", answersOf("draft-1", "what")),
      take("t2", answersOf("idea-1", "spark")),
      take("t3", answersOf("gone-1", "what")),
      take("t4", answersOf("gone-2", "spark"), false),
    ]
    expect(unnamedTakes(takes, draft, kept).map(({ id }) => id)).toEqual(["t3"])
  })

  it("counts the draft's takes once there is no draft (it was set aside)", () => {
    const takes = [take("t1", answersOf("draft-1", "what"))]
    expect(unnamedTakes(takes, null, kept).map(({ id }) => id)).toEqual(["t1"])
  })

  it("names none while the draft or the ideas can't be read", () => {
    const takes = [take("t3", answersOf("gone-1", "what"))]
    expect(unnamedTakes(takes, undefined, kept)).toEqual([])
    expect(unnamedTakes(takes, draft, null)).toEqual([])
  })

  it("reads an idea's answer only by its own shape", () => {
    const odd = [take("t5", "library"), take("t6", "idea:gone-1:bogus")]
    expect(unnamedTakes(odd, draft, kept)).toEqual([])
  })
})

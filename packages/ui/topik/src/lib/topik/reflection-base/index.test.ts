import {
  baseOf,
  earlierBaseOf,
  groupBases,
  readGroups,
} from "@topik/lib/topik/reflection-base"
import { describe, expect, it } from "vitest"

// One of each id form a session has had: `generateId`'s two
// (`apps/www/src/lib/tenant/storage.ts`) and a bare UUID from "Next lesson"
// before #2327.
const UUID = "session-3f1c9a2e-8b7d-4e6f-a5c4-91d2e7b06a1f"
const MS = "session-1761955200000-k3x9q2mz"
const BARE = "7c2e4b19-0d3a-4f58-b6e1-2a9f8c5d7e40"
const DAY = "2026-10-31"

describe("RB1: a reflection group's base tells its sessions apart", () => {
  it("names a new scene by the session's last 8", () => {
    expect(baseOf(DAY, UUID)).toBe("2026-10-31_reflection_e7b06a1f")
    expect(baseOf(DAY, MS)).toBe("2026-10-31_reflection_k3x9q2mz")
    expect(baseOf(DAY, BARE)).toBe("2026-10-31_reflection_8c5d7e40")
  })

  it("names the earlier base by the session's first 8", () => {
    expect(earlierBaseOf(DAY, UUID)).toBe("2026-10-31_reflection_session-")
    expect(earlierBaseOf(DAY, MS)).toBe("2026-10-31_reflection_session-")
    expect(earlierBaseOf(DAY, BARE)).toBe("2026-10-31_reflection_7c2e4b19")
  })

  it("keeps only letters, digits and `-`, as written", () => {
    expect(baseOf(DAY, "session-ab_cd.EF_gh-12")).toBe(
      "2026-10-31_reflection_dEFgh-12"
    )
  })

  it("gives two sessions of one day two bases, in each id form", () => {
    const other = {
      [UUID]: "session-0a9b8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d",
      [MS]: "session-1761958800000-p7w2r8ne",
      [BARE]: "1b3d5f70-2c4e-4a68-8b0d-9f1e3a5c7b92",
    }
    for (const [one, two] of Object.entries(other)) {
      expect(baseOf(DAY, one)).not.toBe(baseOf(DAY, two))
    }
  })

  it("lets a group's earlier base answer it while it is alone on its day", () => {
    expect(groupBases([{ day: DAY, session: UUID }])).toEqual([
      {
        day: DAY,
        session: UUID,
        base: "2026-10-31_reflection_e7b06a1f",
        earlier: "2026-10-31_reflection_session-",
      },
    ])
  })

  it("lets an earlier base shared by two groups of one day answer neither", () => {
    const bases = groupBases([
      { day: DAY, session: UUID },
      { day: DAY, session: MS },
      { day: DAY, session: BARE },
    ])
    expect(bases.map((g) => g.earlier)).toEqual([
      null,
      null,
      "2026-10-31_reflection_7c2e4b19",
    ])
    expect(new Set(bases.map((g) => g.base)).size).toBe(3)
  })

  it("counts only the same day's groups, and each group once", () => {
    const bases = groupBases([
      { day: DAY, session: UUID },
      { day: DAY, session: UUID },
      { day: "2026-11-01", session: MS },
    ])
    expect(bases.map((g) => g.earlier)).toEqual([
      "2026-10-31_reflection_session-",
      "2026-11-01_reflection_session-",
    ])
  })
})

describe("readGroups", () => {
  it("reads groups and nothing else", () => {
    expect(readGroups([{ day: DAY, session: UUID }])).toEqual([
      { day: DAY, session: UUID },
    ])
    for (const raw of [
      null,
      {},
      [{ day: "31 October", session: UUID }],
      [{ day: DAY, session: "" }],
      [{ day: DAY }],
    ]) {
      expect(readGroups(raw)).toBeNull()
    }
  })
})

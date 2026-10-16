import { sessionRecord } from "@/test-support/session-record"
import { describe, expect, it } from "vitest"

import { searchSessions } from "@/lib/tenant/session-search"
import type { SessionRecord } from "@/lib/tenant/types"

function session(
  id: string,
  name: string,
  status: SessionRecord["status"],
  at: string
): SessionRecord {
  return sessionRecord({
    id,
    name,
    status,
    updatedAt: at,
    ...(status === "completed" ? { completedAt: at } : {}),
  })
}

const ALL = [
  session("a", "Korean listening", "completed", "2026-10-01T09:00:00Z"),
  session("b", "Hangul warm-up", "completed", "2026-10-09T09:00:00Z"),
  session("c", "Korean reading", "paused", "2026-10-05T09:00:00Z"),
]

const ids = (found: ReadonlyArray<SessionRecord>): Array<string> =>
  found.map((s) => s.id)

describe("searchSessions", () => {
  it("lists everything newest first when nothing is asked", () => {
    expect(ids(searchSessions(ALL, { text: "", filter: "all" }))).toEqual([
      "b",
      "c",
      "a",
    ])
  })

  it("matches every word of the text, in any case and order", () => {
    expect(
      ids(searchSessions(ALL, { text: "READING korean", filter: "all" }))
    ).toEqual(["c"])
    expect(ids(searchSessions(ALL, { text: "kor", filter: "all" }))).toEqual([
      "c",
      "a",
    ])
  })

  it("filters by finished or not", () => {
    expect(ids(searchSessions(ALL, { text: "", filter: "finished" }))).toEqual([
      "b",
      "a",
    ])
    expect(
      ids(searchSessions(ALL, { text: "korean", filter: "unfinished" }))
    ).toEqual(["c"])
  })
})

import { readFileSync } from "node:fs"
import type { Decisions } from "@job-desk/decisions"
import { parseDecisions } from "@job-desk/decisions"
import type { Digest } from "@job-desk/digest"
import { parseDigest } from "@job-desk/digest"
import { digestFindings } from "@job-desk/findings"
import { QUEUE_FROM } from "@job-desk/policy"
import { freeSlots, openPicks } from "@job-desk/queue"
import { describe, expect, it } from "vitest"

function sample(): Digest {
  const parsed = parseDigest(
    readFileSync(new URL("../sample.digest.json", import.meta.url), "utf8")
  )
  if (!parsed.ok) throw new Error(parsed.problem)
  return parsed.value
}

type Entry = Decisions["picks"][number]

/** A decisions file shared at `sharedAt`, answering `digest`'s picks. */
function decisions(
  digest: Digest,
  sharedAt: string,
  answers: Record<string, Partial<Entry>>
): Decisions {
  const picks = Object.entries(answers).map(([pickId, answer]): Entry => {
    const pick = digest.picks.find((p) => p.id === pickId)!
    return {
      day: digest.day,
      pickId,
      fingerprint: pick.fingerprint,
      id: "ev-1",
      decision: "untouched",
      reasons: [],
      note: "",
      voice: [],
      debrief: null,
      ...answer,
    }
  })
  return {
    schema: "some-ui.job-decisions/1",
    day: sharedAt.slice(0, 10),
    digestDay: digest.day,
    sharedAt,
    picks,
    disagreements: [],
    outcomes: [],
  }
}

const DEBRIEF = {
  id: "ev-2",
  minutes: 6,
  friction: 5,
  frictionChips: [],
  what: "",
  voice: [],
  result: "gave-up" as const,
}

const ids = (digest: Digest): ReadonlyArray<string> =>
  digest.picks.map((p) => p.id)

describe("openPicks", () => {
  it("holds every pick no shared file has answered", () => {
    const digest = sample()
    expect(openPicks([digest], []).map((p) => p.pickId)).toEqual(ids(digest))
  })

  it("frees a pick passed, archived or debriefed, and keeps one untouched or only taken", () => {
    const digest = sample()
    const [passed, archived, debriefed, taken] = ids(digest)
    const file = decisions(digest, "2026-10-18T22:00:00Z", {
      [passed!]: { decision: "passed" },
      [archived!]: { decision: "archived" },
      [debriefed!]: { decision: "taken", debrief: DEBRIEF },
      [taken!]: { decision: "taken" },
    })
    expect(openPicks([digest], [file]).map((p) => p.pickId)).toEqual([taken])
  })

  it("goes by the newest share, whatever order the files come in", () => {
    const digest = sample()
    const [first] = ids(digest)
    const archived = decisions(digest, "2026-10-18T22:00:00Z", {
      [first!]: { decision: "archived" },
    })
    const retaken = decisions(digest, "2026-10-19T08:00:00Z", {
      [first!]: { decision: "taken" },
    })
    for (const files of [
      [archived, retaken],
      [retaken, archived],
    ]) {
      expect(openPicks([digest], files).map((p) => p.pickId)).toContain(first)
    }
  })

  it("names each pick by its own digest's day", () => {
    const today = sample()
    const earlier = { ...sample(), day: "2026-10-17" }
    const file = decisions(today, "2026-10-18T22:00:00Z", {
      [today.picks[0]!.id]: { decision: "passed" },
    })
    const open = openPicks([today, earlier], [file])
    expect(open.filter((p) => p.day === "2026-10-17")).toHaveLength(
      earlier.picks.length
    )
    expect(open[0]).toMatchObject({ day: "2026-10-17", track: "software" })
  })
})

describe("freeSlots", () => {
  it("is each track's limit less what is open, never below none", () => {
    const digest = sample()
    expect(freeSlots(openPicks([digest], []))).toEqual({
      software: 1,
      adjacent: 0,
    })
    const crowded = { ...digest, picks: [...digest.picks, ...digest.picks] }
    expect(freeSlots(openPicks([crowded], []))).toEqual({
      software: 0,
      adjacent: 0,
    })
  })

  it("counts no slot for a pick whose posting closed", () => {
    const open = [
      { day: "2026-10-17", pickId: "abc-1234", track: "software" as const },
    ]
    expect(freeSlots(open, new Set(["2026-10-17/abc-1234"])).software).toBe(3)
  })
})

describe("a digest's queue", () => {
  const messages = (digest: Digest): ReadonlyArray<string> =>
    digestFindings(digest).map((f) => `${f.path}: ${f.message}`)
  type Held = NonNullable<Digest["queue"]>["open"][number]
  const held = (pickId: string, closed = false): Held => ({
    day: "2026-10-17",
    pickId,
    track: "adjacent" as const,
    closed,
  })

  it("adds no pick to a track whose slots are still open", () => {
    const digest = sample()
    digest.queue = { open: [held("old-0001")] }
    expect(messages(digest)).toContain(
      "picks: 2 adjacent picks, but 1 of 2 slots are still open; room for 1"
    )
  })

  it("takes a full queue with no picks, and a closed posting's slot", () => {
    const digest = sample()
    digest.queue = { open: [held("old-0001", true)] }
    expect(messages(digest)).toEqual([])
    const full = sample()
    full.picks = full.picks.filter((p) => p.track === "software")
    full.queue = { open: [held("old-0001"), held("old-0002")] }
    expect(messages(full)).toEqual([])
  })

  it("lists only earlier digests' picks, each once", () => {
    const digest = sample()
    digest.picks = []
    digest.queue = {
      open: [
        held("old-0001"),
        held("old-0001"),
        { ...held("new-0001"), day: digest.day },
      ],
    }
    expect(messages(digest)).toEqual([
      "queue.open.1: 2026-10-17/old-0001 is listed twice",
      `queue.open.2.day: an open pick comes from a digest before ${digest.day}`,
    ])
  })

  it("is recorded by every digest since the queue landed", () => {
    const digest = { ...sample(), day: QUEUE_FROM, queue: null }
    expect(messages(digest)).toContain(
      `queue: a digest from ${QUEUE_FROM} on records its queue (ROUTINE.md §2)`
    )
  })

  it("opens a digest written before the queue", () => {
    const { queue: _, ...before } = sample()
    const parsed = parseDigest(JSON.stringify(before))
    expect(parsed.ok && parsed.value.queue).toBe(null)
  })
})

describe("an archived pick", () => {
  it("is a decision a file can share", () => {
    const digest = sample()
    const file = decisions(digest, "2026-10-18T22:00:00Z", {
      [digest.picks[0]!.id]: { decision: "archived" },
    })
    expect(parseDecisions(JSON.stringify(file)).ok).toBe(true)
  })
})

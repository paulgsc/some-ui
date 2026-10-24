import { readFileSync } from "node:fs"
import type { Decisions } from "@job-desk/decisions"
import type { Digest } from "@job-desk/digest"
import { parseDigest } from "@job-desk/digest"
import { digestFindings } from "@job-desk/findings"
import { QUEUE_FROM } from "@job-desk/policy"
import { freeSlots, hasLapsed, lapsesOn, queueOf } from "@job-desk/queue"
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
      fit: [],
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

/** The sample's own day: nothing it picked has lapsed yet. */
const DAY = "2026-10-18"

const openOf = (
  digests: ReadonlyArray<Digest>,
  files: ReadonlyArray<Decisions>,
  today = DAY
): ReadonlyArray<string> =>
  queueOf(digests, files, today).open.map((p) => p.pickId)

describe("queueOf: what stays open", () => {
  it("holds every pick no shared file has answered", () => {
    const digest = sample()
    expect(openOf([digest], [])).toEqual(ids(digest))
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
    expect(openOf([digest], [file])).toEqual([taken])
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
      expect(openOf([digest], files)).toContain(first)
    }
  })

  it("names each pick by its own digest's day", () => {
    const today = sample()
    const earlier = { ...sample(), day: "2026-10-17" }
    const file = decisions(today, "2026-10-18T22:00:00Z", {
      [today.picks[0]!.id]: { decision: "passed" },
    })
    const { open } = queueOf([today, earlier], [file], DAY)
    expect(open.filter((p) => p.day === "2026-10-17")).toHaveLength(
      earlier.picks.length
    )
    expect(open[0]).toMatchObject({ day: "2026-10-17", track: "software" })
  })
})

/** A later digest that recorded `pickId` of `earlier` as lapsed. */
const recorderOf = (earlier: Digest, pickId: string): Digest => ({
  ...sample(),
  day: "2026-10-21",
  picks: [],
  queue: {
    open: [],
    lapsed: [{ day: earlier.day, pickId, track: "software" }],
  },
})

describe("queueOf: a pick left untouched lapses", () => {
  it("lapses on its digest's day plus three, and not a day before", () => {
    expect(lapsesOn(DAY)).toBe("2026-10-21")
    expect(hasLapsed(DAY, "2026-10-20")).toBe(false)
    expect(hasLapsed(DAY, "2026-10-21")).toBe(true)
    const digest = sample()
    expect(queueOf([digest], [], "2026-10-20").lapsed).toEqual([])
    const lapsed = queueOf([digest], [], "2026-10-21")
    expect(lapsed.open).toEqual([])
    expect(lapsed.lapsed.map((p) => p.pickId)).toEqual(ids(digest))
  })

  it("lapses one reported untouched, never one taken, passed or debriefed", () => {
    const digest = sample()
    const [untouched, taken, passed, debriefed] = ids(digest)
    const file = decisions(digest, "2026-10-19T22:00:00Z", {
      [untouched!]: { decision: "untouched", id: null },
      [taken!]: { decision: "taken" },
      [passed!]: { decision: "passed" },
      [debriefed!]: { decision: "taken", debrief: DEBRIEF },
    })
    const queue = queueOf([digest], [file], "2026-10-25")
    expect(queue.open.map((p) => p.pickId)).toEqual([taken])
    expect(queue.lapsed.map((p) => p.pickId)).toEqual(
      ids(digest).filter((id) => ![taken, passed, debriefed].includes(id))
    )
  })

  it("opens a pick again when a share takes it after a digest recorded its lapse", () => {
    const earlier = sample()
    const [first] = ids(earlier)
    const recorder = recorderOf(earlier, first!)
    const late = decisions(earlier, "2026-10-22T08:00:00Z", {
      [first!]: { decision: "taken" },
    })
    const queue = queueOf([earlier, recorder], [late], "2026-10-23")
    expect(queue.open.map((p) => p.pickId)).toEqual([first])
  })

  it("names a lapse once: not again after a digest recorded it", () => {
    const earlier = sample()
    const [first, ...rest] = ids(earlier)
    const recorder = recorderOf(earlier, first!)
    const queue = queueOf([earlier, recorder], [], "2026-10-22")
    expect(queue.lapsed.map((p) => p.pickId)).toEqual(rest)
    expect(queue.open).toEqual([])
  })
})

describe("freeSlots", () => {
  it("is each track's limit less what is open, never below none", () => {
    const digest = sample()
    expect(freeSlots(queueOf([digest], [], DAY).open)).toEqual({
      software: 1,
      adjacent: 0,
    })
    const crowded = { ...digest, picks: [...digest.picks, ...digest.picks] }
    expect(freeSlots(queueOf([crowded], [], DAY).open)).toEqual({
      software: 0,
      adjacent: 0,
    })
  })

  it("counts no slot for a pick whose posting closed", () => {
    expect(freeSlots([{ track: "software", closed: true }]).software).toBe(3)
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
    digest.queue = { open: [held("old-0001")], lapsed: [] }
    expect(messages(digest)).toContain(
      "picks: 2 adjacent picks, but 1 of 2 slots are still open; room for 1"
    )
  })

  it("takes a full queue with no picks, and a closed posting's slot", () => {
    const digest = sample()
    digest.queue = { open: [held("old-0001", true)], lapsed: [] }
    expect(messages(digest)).toEqual([])
    const full = sample()
    full.picks = full.picks.filter((p) => p.track === "software")
    full.queue = { open: [held("old-0001"), held("old-0002")], lapsed: [] }
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
      lapsed: [],
    }
    expect(messages(digest)).toEqual([
      "queue.open.1: 2026-10-17/old-0001 is listed twice",
      `queue.open.2.day: an open pick comes from a digest before ${digest.day}`,
    ])
  })

  it("records a lapse only once due, and once in the whole queue", () => {
    const digest = sample()
    digest.picks = []
    type Gone = NonNullable<Digest["queue"]>["lapsed"][number]
    const gone = (pickId: string, day: string): Gone => ({
      day,
      pickId,
      track: "adjacent",
    })
    digest.queue = {
      open: [held("old-0001")],
      lapsed: [
        gone("old-0002", "2026-10-15"),
        gone("old-0003", "2026-10-16"),
        gone("old-0001", "2026-10-15"),
        gone("old-0002", "2026-10-15"),
      ],
    }
    expect(messages(digest)).toEqual([
      "queue.lapsed.1.day: 2026-10-16/old-0003 lapses only on 2026-10-19",
      "queue.lapsed.3: 2026-10-15/old-0002 is listed twice",
    ])
    digest.queue.open = [{ ...held("old-0001"), day: "2026-10-15" }]
    expect(messages(digest)).toContain(
      "queue.lapsed.2: 2026-10-15/old-0001 is listed twice"
    )
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

import type { Week } from "@rust-rounds/lib/formats/week"
import { AREAS, chooseTopics, SEEDS_MOST } from "@rust-rounds/lib/monday/topics"
import type { Seed } from "@rust-rounds/lib/monday/topics"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { describe, expect, it } from "vitest"

const seed = (at: string): Seed => ({
  week: "2026-w46",
  at,
  text: "error",
  said: null,
})

const touching = (id: string, ...concepts: Array<string>): Week => ({
  ...QUILLMOSS_WEEK,
  id,
  tickets: QUILLMOSS_WEEK.tickets.map((ticket, i) => ({
    ...ticket,
    concepts:
      concepts[i] === undefined
        ? ticket.concepts
        : [{ id: concepts[i], name: concepts[i] }],
  })),
})

describe("chooseTopics", () => {
  it("names each area once, under one of the four references", () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length)
  })

  it("takes the areas no week touched first, in the table's order", () => {
    const { topics } = chooseTopics({
      weeks: [QUILLMOSS_WEEK],
      seeds: [],
      due: [],
    })
    expect(topics.map((t) => t.id)).toEqual([
      "moves-out-of-collections",
      "aliasing-and-mutation",
    ])
  })

  it("then the area touched longest ago", () => {
    const untouched = AREAS.map((a) => a.id)
    const weeks = [
      touching(
        "2026-w40",
        untouched[0] ?? "",
        untouched[1] ?? "",
        untouched[2] ?? ""
      ),
      // Every other area, touched later.
      ...untouched
        .slice(3)
        .map((id, i) => touching(`2026-w${41 + i}`, id, id, id)),
    ]
    const { topics } = chooseTopics({ weeks, seeds: [], due: [] })
    expect(topics.map((t) => t.id)).toEqual(untouched.slice(0, 2))
  })

  it("puts what the decay record marks due before any area", () => {
    const { topics } = chooseTopics({
      weeks: [],
      seeds: [],
      due: [
        {
          id: "send-and-sync",
          name: "Send and Sync",
          why: "decayed",
          last: "2026-w44",
        },
      ],
    })
    expect(topics.map((t) => [t.id, t.why, t.reference])).toEqual([
      ["send-and-sync", "due", "rustonomicon"],
      ["borrows-into-a-reused-buffer", "area", "ownership-inventory"],
    ])
  })

  it(`seeds at most ${SEEDS_MOST} pasted errors, oldest first, leaving one topic`, () => {
    const seeds = [
      "2026-11-13T09:00:00Z",
      "2026-11-10T09:00:00Z",
      "2026-11-12T09:00:00-08:00",
      "2026-11-11T09:00:00Z",
    ].map(seed)
    const choice = chooseTopics({ weeks: [], seeds, due: [] })
    expect(choice.seeds.map((s) => s.at)).toEqual([
      "2026-11-10T09:00:00Z",
      "2026-11-11T09:00:00Z",
      "2026-11-12T09:00:00-08:00",
    ])
    expect(choice.notSeeded.map((s) => s.at)).toEqual(["2026-11-13T09:00:00Z"])
    expect(choice.topics).toHaveLength(1)
  })
})

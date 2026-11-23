/**
 * @vitest-environment node
 */
import type { AskFile, AskWaits } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import type { KindedAsk } from "@/lib/asks/list"
import {
  ASK_VIEWS,
  chipCounts,
  INITIAL_LIST,
  landingKind,
  listed,
  listSearch,
  ofKind,
  pivot,
  searchOf,
  step,
  unreadOf,
  VIEW_PATHS,
  viewAt,
  waitingOf,
} from "@/lib/asks/list"
import type { AskIssue } from "@/lib/asks/model"

const decisionOf = (
  question: string,
  waits: AskWaits | null = "claude"
): AskFile => {
  const asked = {
    schema: "some-ui.ask/3" as const,
    kind: "decision" as const,
    question,
    whyYours: "Only you.",
    refs: [],
    options: [
      { says: "Yes", unblocks: "it" },
      { says: "No", unblocks: "nothing" },
    ],
  }
  return waits === null
    ? { ...asked, waits: null, call: null, unblocks: null }
    : { ...asked, waits, call: "story", unblocks: "the next story" }
}

const checklistOf = (question: string): AskFile => ({
  schema: "some-ui.ask/3",
  kind: "checklist",
  question,
  whyYours: "Only you.",
  refs: [],
  waits: "pipeline",
  call: "environment",
  unblocks: "the pictures",
  steps: [{ says: "A key", do: ["Make it"] }],
})

const issue = (
  number: number,
  ask: AskFile | null,
  opened: string,
  answered: string | null = null
): AskIssue => ({
  id: `some-ui-${String(number)}`,
  repo: "some-ui",
  number,
  url: `https://github.com/paulgsc/some-ui/issues/${String(number)}`,
  title: `Issue ${String(number)}`,
  opened,
  answered,
  ask,
})

const NOV1 = "2026-11-01T00:00:00Z"
const NOV2 = "2026-11-02T00:00:00Z"

describe("the views' addresses", () => {
  it("give every view one, and read each back", () => {
    for (const view of ASK_VIEWS) expect(viewAt(VIEW_PATHS[view])).toBe(view)
    expect(viewAt("decision")).toBeNull()
  })
})

describe("where Asks opens", () => {
  it("is the first kind with an ask waiting, else decisions", () => {
    const answered = issue(2, decisionOf("Go?"), NOV1, NOV2)
    const keys = issue(1, checklistOf("Keys?"), NOV1)
    expect(landingKind([answered, keys])).toBe("checklist")
    expect(landingKind([issue(3, null, NOV1)])).toBe("decision")
  })
})

describe("a kind's asks", () => {
  it("hold only that kind, count those waiting, and leave the unread to the nav", () => {
    const asks = [
      issue(1, checklistOf("Keys?"), NOV1),
      issue(2, decisionOf("Go?"), NOV1),
      issue(4, decisionOf("Was?"), NOV1, NOV2),
      issue(3, null, NOV1),
      issue(5, null, NOV1, NOV2),
    ]
    expect(ofKind(asks, "decision").map((a) => a.number)).toEqual([2, 4])
    expect(waitingOf(asks, "decision")).toBe(1)
    expect(unreadOf(asks).map((a) => a.number)).toEqual([3])
  })
})

describe("a list's step", () => {
  it("opens and shuts one row at a time", () => {
    const opened = step(INITIAL_LIST, { kind: "toggled", id: "a" })
    expect(opened.open).toBe("a")
    expect(step(opened, { kind: "toggled", id: "b" }).open).toBe("b")
    expect(step(opened, { kind: "toggled", id: "a" }).open).toBeNull()
  })

  it("writes to the address only what differs from how it starts", () => {
    expect(searchOf(INITIAL_LIST)).toEqual({})
    const moved = { ...INITIAL_LIST, waits: "home" as const, open: "a" }
    expect(searchOf(moved)).toEqual({ waits: "home", open: "a" })
    expect(listSearch(searchOf(moved))).toEqual(moved)
  })

  it("is read from the address, anything unknown as it starts", () => {
    expect(listSearch({})).toEqual(INITIAL_LIST)
    expect(
      listSearch({ waits: "home", call: "nope", show: "all", open: 3 })
    ).toEqual({ ...INITIAL_LIST, waits: "home", show: "all" })
  })
})

describe("a list's rows", () => {
  const old = issue(1, decisionOf("B: old"), NOV1)
  const recent = issue(
    2,
    decisionOf("A: recent", "home"),
    "2026-11-21T00:00:00Z"
  )
  const unsaid = issue(3, decisionOf("C: unsaid", null), "2026-11-10T00:00:00Z")
  const done = issue(
    4,
    decisionOf("0: done"),
    "2026-10-01T00:00:00Z",
    "2026-11-20T00:00:00Z"
  )
  const asks = ofKind([old, recent, unsaid, done], "decision")
  const ids = (rows: ReadonlyArray<KindedAsk<"decision">>): Array<number> =>
    rows.map((r) => r.number)
  const all = { ...INITIAL_LIST, show: "all" as const }

  it("put answered asks last under every order", () => {
    expect(ids(listed(asks, all))).toEqual([1, 3, 2, 4])
    expect(ids(listed(asks, { ...all, order: "newest" }))).toEqual([2, 3, 1, 4])
    expect(ids(listed(asks, { ...all, order: "aToZ" }))).toEqual([2, 1, 3, 4])
  })

  it("narrow by who waits, the call, and whether answered, unsaid included", () => {
    expect(ids(listed(asks, INITIAL_LIST))).toEqual([1, 3, 2])
    expect(ids(listed(asks, { ...all, show: "answered" }))).toEqual([4])
    expect(ids(listed(asks, { ...all, waits: "home" }))).toEqual([2])
    expect(ids(listed(asks, { ...all, call: "unsaid" }))).toEqual([3])
    const counts = chipCounts(asks, INITIAL_LIST)
    expect([
      counts.waits("claude"),
      counts.waits("unsaid"),
      counts.show("all"),
    ]).toEqual([1, 1, 4])
  })
})

describe("the pivot", () => {
  const asks = [
    issue(1, decisionOf("Go?"), NOV1),
    issue(2, checklistOf("Keys?"), NOV1),
    issue(3, decisionOf("Was?"), NOV1, NOV2),
    issue(4, decisionOf("Old?", null), NOV1),
    issue(5, null, NOV1),
  ]

  it("counts the waiting asks by call and who waits, split by kind, leaving out what none has", () => {
    const grid = pivot(asks, "waiting")
    expect(grid.calls).toEqual(["environment", "story", "unsaid"])
    expect(grid.waits).toEqual(["claude", "pipeline", "unsaid"])
    expect(grid.cell("story", "claude")).toEqual({ decision: 1, checklist: 0 })
    expect(grid.cell("environment", "pipeline")).toEqual({
      decision: 0,
      checklist: 1,
    })
    expect(grid.cell("unsaid", "unsaid")).toEqual({ decision: 1, checklist: 0 })
  })

  it("counts the answered too when asked", () => {
    expect(pivot(asks, "all").cell("story", "claude")).toEqual({
      decision: 2,
      checklist: 0,
    })
  })
})

import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { RunsAnswer } from "@topik/lib/topik/adapter/routine-runs"
import {
  createRunLog,
  parseRoutineRuns,
  ROUTINE_RUNS_KEY,
} from "@topik/lib/topik/adapter/routine-runs"
import { describe, expect, it } from "vitest"

const run = (
  startedAt: string,
  over: Record<string, unknown> = {}
): Record<string, unknown> => ({
  schema: "some-ui.routine-run/1",
  routine: "reflections",
  startedAt,
  finishedAt: startedAt,
  outcome: "done",
  found: { reflections: 1, prompts: 0 },
  added: [
    {
      folder: "scene",
      name: "scene-a.json",
      title: "TOPIK 2 · 로맨스 · 첫 만남",
    },
  ],
  ...over,
})
const held = (
  name: string,
  file: unknown
): { folder: string; name: string; file: unknown } => ({
  folder: "run",
  name,
  file,
})
const AT = "2026-10-24T18:00:00.000Z"

describe("parseRoutineRuns", () => {
  it("reads each run home holds, with when home answered", () => {
    expect(
      parseRoutineRuns({
        files: [],
        runs: [
          held(
            "run-reflections-20261024T160208Z.json",
            run("2026-10-24T16:02:08Z", {
              outcome: "partly",
              problems: ["One drama couldn't be made playable."],
              voice: { waiting: 1, missed: 0, unread: false },
              nextBy: "2026-10-25T17:00:00Z",
            })
          ),
        ],
        at: AT,
      })
    ).toEqual({
      at: AT,
      runs: [
        {
          name: "run-reflections-20261024T160208Z.json",
          startedAt: "2026-10-24T16:02:08.000Z",
          finishedAt: "2026-10-24T16:02:08.000Z",
          outcome: "partly",
          found: { reflections: 1, prompts: 0 },
          added: [
            {
              folder: "scene",
              name: "scene-a.json",
              title: "TOPIK 2 · 로맨스 · 첫 만남",
            },
          ],
          problems: ["One drama couldn't be made playable."],
          voice: { waiting: 1, missed: 0, unread: false },
          nextBy: "2026-10-25T17:00:00.000Z",
        },
      ],
    })
  })

  it("keeps every instant as UTC, whatever offset it came with, so they compare as text", () => {
    const answer = parseRoutineRuns({
      runs: [
        held(
          "a.json",
          run("2026-10-25T01:02:08+09:00", {
            nextBy: "2026-10-25T14:00:00+09:00",
          })
        ),
      ],
      at: "2026-10-25T06:00:00+09:00",
    })
    expect(answer?.at).toBe("2026-10-24T21:00:00.000Z")
    expect(answer?.runs[0]).toMatchObject({
      startedAt: "2026-10-24T16:02:08.000Z",
      nextBy: "2026-10-25T05:00:00.000Z",
    })
  })

  it("leaves out a run of a shape it does not know, and reads an answer without runs as saying nothing of them", () => {
    const answer = parseRoutineRuns({
      runs: [
        held("a.json", run("2026-10-24T16:02:08Z", { outcome: "fine" })),
        held("b.json", run("yesterday")),
        held("c.json", { schema: "some-ui.routine-run/2" }),
        held("d.json", run("2026-10-23T16:02:08Z")),
      ],
      at: AT,
    })
    expect(answer?.runs.map((one) => one.name)).toEqual(["d.json"])
    expect(answer?.runs[0]).toMatchObject({ problems: [], nextBy: null })
    expect(parseRoutineRuns({ files: [] })).toBeNull()
    expect(parseRoutineRuns({ files: [], runs: [] })).toBeNull()
    expect(parseRoutineRuns(null)).toBeNull()
  })
})

describe("parseRoutineRuns, beside the jobs routine", () => {
  it("leaves out another routine's runs, even one this shape would take", () => {
    const answer = parseRoutineRuns({
      runs: [
        held(
          "run-jobs-20261024T145207Z.json",
          run("2026-10-24T14:52:07Z", { routine: "jobs" })
        ),
        held(
          "run-reflections-20261023T160208Z.json",
          run("2026-10-23T16:02:08Z")
        ),
      ],
      at: AT,
    })
    expect(answer?.runs.map((one) => one.name)).toEqual([
      "run-reflections-20261023T160208Z.json",
    ])
    expect(answer?.runs[0]).not.toHaveProperty("routine")
  })
})

describe("createRunLog", () => {
  const answer = (at: string, ...starts: Array<string>): RunsAnswer => ({
    at,
    runs: starts.map((startedAt) => ({
      name: `run-${startedAt}.json`,
      startedAt,
      found: { reflections: 0, prompts: 0 },
      finishedAt: null,
      problems: [],
      voice: null,
      nextBy: null,
      outcome: "done",
      added: [],
    })),
  })

  it("keeps every run once, newest first, and when home last answered, across logs on one device", () => {
    const storage = memoryStorage()
    const log = createRunLog(storage)
    log.keep("home", answer("2026-10-23T18:00:00.000Z", "2026-10-23T16:00:00Z"))
    log.keep("home", answer(AT, "2026-10-24T16:00:00Z", "2026-10-23T16:00:00Z"))
    // An older answer, served again after a look that failed, moves nothing back.
    log.keep("home", answer("2026-10-23T18:00:00.000Z"))
    const again = createRunLog(storage).held("home")
    expect(again.runs.map((one) => one.startedAt)).toEqual([
      "2026-10-24T16:00:00Z",
      "2026-10-23T16:00:00Z",
    ])
    expect(again.lookedAt).toBe(AT)
    expect(again.since).toBe("2026-10-23T18:00:00.000Z")
  })

  it("reads runs kept before they said what became of their voice notes as saying nothing of it", () => {
    const storage = memoryStorage()
    const before = {
      name: "run-a.json",
      startedAt: "2026-10-23T16:00:00.000Z",
      finishedAt: null,
      outcome: "partly",
      found: { reflections: 1, prompts: 0 },
      added: [],
      problems: [],
      nextBy: null,
    }
    storage.setItem(
      ROUTINE_RUNS_KEY,
      JSON.stringify({
        version: 1,
        homes: { home: { runs: [before], lookedAt: AT, since: AT } },
      })
    )
    expect(createRunLog(storage).held("home").runs).toEqual([
      { ...before, voice: null },
    ])
    // From home too: a run that says nothing of them reads as null.
    expect(
      parseRoutineRuns({
        runs: [held("run-b.json", run("2026-10-24T16:00:00Z"))],
        at: AT,
      })?.runs[0]?.voice
    ).toBeNull()
  })

  it("keeps what another page on this device kept since it read", () => {
    const storage = memoryStorage()
    const first = createRunLog(storage)
    const second = createRunLog(storage)
    first.keep("a", answer(AT, "2026-10-24T16:00:00Z"))
    second.keep("b", answer(AT, "2026-10-23T16:00:00Z"))
    const again = createRunLog(storage)
    expect(again.held("a").runs).toHaveLength(1)
    expect(again.held("b").runs).toHaveLength(1)
  })

  it("holds nothing of one home under another, and tells only on a change", () => {
    const log = createRunLog(memoryStorage())
    let told = 0
    log.subscribe(() => {
      told += 1
    })
    log.keep("a", answer(AT, "2026-10-24T16:00:00Z"))
    const first = log.held("a")
    log.keep("a", answer(AT, "2026-10-24T16:00:00Z"))
    expect(log.held("a")).toBe(first)
    expect(told).toBe(1)
    expect(log.held("b")).toEqual({ runs: [], lookedAt: null, since: null })
  })

  it("moves a record it cannot read aside, never over it", () => {
    const storage = memoryStorage()
    storage.setItem(ROUTINE_RUNS_KEY, "{not json")
    const log = createRunLog(storage)
    log.keep("home", answer(AT, "2026-10-24T16:00:00Z"))
    expect(log.held("home").runs).toHaveLength(1)
    expect(storage.getItem(`${ROUTINE_RUNS_KEY}:unreadable:1`)).toBe(
      "{not json"
    )
    expect(createRunLog(storage).held("home").runs).toHaveLength(1)
  })
})

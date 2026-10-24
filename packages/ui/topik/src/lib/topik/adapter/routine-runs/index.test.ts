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
              problems: ["One voice note couldn't be heard."],
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
          startedAt: "2026-10-24T16:02:08Z",
          finishedAt: "2026-10-24T16:02:08Z",
          outcome: "partly",
          found: { reflections: 1, prompts: 0 },
          added: [
            {
              folder: "scene",
              name: "scene-a.json",
              title: "TOPIK 2 · 로맨스 · 첫 만남",
            },
          ],
          problems: ["One voice note couldn't be heard."],
          nextBy: "2026-10-25T17:00:00Z",
        },
      ],
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

describe("createRunLog", () => {
  const answer = (at: string, ...starts: Array<string>): RunsAnswer => ({
    at,
    runs: starts.map((startedAt) => ({
      name: `run-${startedAt}.json`,
      startedAt,
      found: { reflections: 0, prompts: 0 },
      finishedAt: null,
      problems: [],
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

  it("never writes over a record it cannot read", () => {
    const storage = memoryStorage()
    storage.setItem(ROUTINE_RUNS_KEY, "{not json")
    const log = createRunLog(storage)
    log.keep("home", answer(AT, "2026-10-24T16:00:00Z"))
    expect(log.held("home").runs).toHaveLength(1)
    expect(storage.getItem(ROUTINE_RUNS_KEY)).toBe("{not json")
  })
})

import { readFileSync } from "node:fs"
import type { JobsRun } from "@job-desk/run"
import {
  MACHINERY,
  pacificDay,
  pacificMinutes,
  parseJobsRun,
  runFileName,
  runFindings,
} from "@job-desk/run"
import { describe, expect, it } from "vitest"

const STARTED = "2026-10-26T14:52:07Z"
const NAME = "run-jobs-20261026T145207Z.json"

function done(over: Partial<JobsRun> = {}): JobsRun {
  return {
    schema: "some-ui.routine-run/1",
    routine: "jobs",
    startedAt: STARTED,
    finishedAt: "2026-10-26T15:00:41Z",
    outcome: "done",
    found: { postings: 7, scouts: 1, decisions: 2 },
    added: [
      {
        folder: "brief",
        name: "digest-2026-10-26.json",
        title: "Picked 2 of 7 postings",
      },
    ],
    problems: [],
    ...over,
  }
}

const stopped = (problem: string): JobsRun =>
  done({
    outcome: "stopped",
    found: { postings: 0, scouts: 0, decisions: 0 },
    added: [],
    problems: [problem],
  })

const messages = (run: JobsRun, name = NAME): ReadonlyArray<string> =>
  runFindings(run, name).map((f) => `${f.path}: ${f.message}`)

describe("ROUTINE.md's example record", () => {
  it("passes the checker under the name it gives", () => {
    const routine = readFileSync(
      new URL("../../ROUTINE.md", import.meta.url),
      "utf8"
    )
    const section = routine.slice(routine.indexOf("## 9. The run record"))
    const example = /```json\n([\s\S]*?)\n```/.exec(section)?.[1]
    expect(example).toBeDefined()
    const parsed = parseJobsRun(example ?? "")
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(
        messages(parsed.value, runFileName(parsed.value.startedAt))
      ).toEqual([])
    }
  })
})

describe("runFileName", () => {
  it("names the run for when it started, in UTC to the second, as the mailbox takes it", () => {
    expect(runFileName(STARTED)).toBe(NAME)
    expect(runFileName("2026-10-26T07:52:07.512-07:00")).toBe(NAME)
  })
})

describe("pacificDay", () => {
  it("reads the Pacific day across both offsets", () => {
    expect(pacificDay(new Date("2026-10-22T06:59:00Z"))).toBe("2026-10-21")
    expect(pacificDay(new Date("2026-10-22T07:00:00Z"))).toBe("2026-10-22")
    expect(pacificDay(new Date("2026-12-01T07:59:00Z"))).toBe("2026-11-30")
    expect(pacificDay(new Date("2026-12-01T08:00:00Z"))).toBe("2026-12-01")
  })
})

describe("pacificMinutes", () => {
  it("reads the Pacific clock across both offsets, midnight as 0", () => {
    expect(pacificMinutes(new Date("2026-10-22T14:52:00Z"))).toBe(7 * 60 + 52)
    expect(pacificMinutes(new Date("2026-12-01T15:52:00Z"))).toBe(7 * 60 + 52)
    expect(pacificMinutes(new Date("2026-10-22T07:00:00Z"))).toBe(0)
    expect(pacificMinutes(new Date("2026-10-22T06:59:00Z"))).toBe(23 * 60 + 59)
  })
})

describe("runFindings", () => {
  it("passes a stopped run that says why, in my terms", () => {
    expect(
      messages(
        stopped(
          "This session couldn't search the web, so there are no picks today."
        )
      )
    ).toEqual([])
  })

  it("passes a run that wrote the digest and left something out", () => {
    expect(
      messages(
        done({
          outcome: "partly",
          problems: [
            "One voice note couldn't be heard, so it waits for tomorrow.",
          ],
        })
      )
    ).toEqual([])
  })

  it("holds the file to the name its start gives it", () => {
    expect(messages(done(), "run.json")).toEqual([
      `startedAt: the file is run.json, but a run that started then is ${NAME}`,
    ])
  })

  it("holds the clock and the digest to this morning", () => {
    expect(
      messages(
        done({
          finishedAt: "2026-10-26T14:00:00Z",
          added: [
            { folder: "brief", name: "digest-2026-10-25.json", title: "Picks" },
            { folder: "brief", name: "digest-2026-10-26.json", title: "Picks" },
          ],
        })
      )
    ).toEqual([
      "finishedAt: before startedAt",
      "added.0.name: this morning's digest is digest-2026-10-26.json",
      "added: a run adds one digest at most",
    ])
  })

  it("holds each outcome to what it means", () => {
    expect(messages(done({ problems: ["Something went wrong."] }))).toEqual([
      "outcome: a run with problems is partly or stopped",
    ])
    expect(messages(done({ outcome: "partly" }))).toEqual([
      "problems: a run that is partly says why",
    ])
    expect(
      messages(done({ outcome: "stopped", problems: ["Stopped."] }))
    ).toEqual([
      "outcome: a stopped run wrote no digest; one that did is partly",
    ])
    expect(
      messages({ ...stopped("Stopped."), outcome: "done", problems: [] })
    ).toEqual(["outcome: no digest was added, so the run stopped"])
    expect(messages({ ...stopped("x."), problems: [] })).toEqual([
      "problems: a run that is stopped says why",
    ])
  })

  it("keeps each problem one sentence the phone can show", () => {
    expect(messages(stopped(`${"a".repeat(200)}.`))).toEqual([
      "problems.0: over 200 characters",
    ])
    expect(messages(stopped("No picks today"))).toEqual([
      "problems.0: not a sentence",
    ])
  })

  it("never lets the machinery reach the screen", () => {
    for (const problem of [
      "The mailbox answered 401.",
      "JOBS_MAILBOX_TOKEN is unset.",
      "Stopped at §0.2.",
      "The checker found the digest's schema wrong.",
      "The request to https://api.lever.co failed.",
      "Couldn't sync with home.",
      "The upload answered 503.",
    ]) {
      expect(MACHINERY.test(problem), problem).toBe(true)
      expect(messages(stopped(problem))).toHaveLength(1)
    }
    for (const problem of [
      "This session couldn't search the web, so there are no picks today.",
      "Today's picks were already in Drive, so this run added none.",
      "Home couldn't be reached, so today's picks are in Drive only.",
      "Two of your shares couldn't be read, so they wait for tomorrow.",
      "I read 120 postings, and your places were full.",
      "No response came from two forms, so their questions are left out.",
    ]) {
      expect(MACHINERY.test(problem), problem).toBe(false)
    }
  })
})

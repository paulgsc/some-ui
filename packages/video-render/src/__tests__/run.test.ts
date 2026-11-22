/**
 * An `[ORCH]` issue's body carries one ```json run block: the owner's live
 * goals, the legs before each, the workers and what the owner marked done,
 * read as the run or refused with every reason.
 */
import { parseRunBody, RUN_SCHEMA } from "@video-render/run"
import { describe, expect, it } from "vitest"

const run = {
  schema: RUN_SCHEMA,
  day: "2026-11-22",
  goals: [
    {
      id: "G1",
      kind: "deploy-home",
      title: "Deploy home",
      dest: "Home runs today's release",
      motive: "Home runs the newest release.",
      legs: [
        {
          leg: "merge",
          pr: { repo: "server", kind: "pr", number: 1129 },
          says: "Home's release",
        },
        { leg: "yours", says: "You deploy home" },
      ],
    },
    {
      id: "G3",
      kind: "watch-on-phone",
      title: "Watch the Rust essay",
      dest: "The w47 essay on your phone",
      motive: "It waits on two takes.",
      legs: [
        { leg: "goal", goal: "G1" },
        {
          leg: "yours",
          ask: { repo: "some-ui", kind: "issue", number: 3433 },
          step: 6,
        },
        { leg: "home", says: "Home renders the essay" },
        { leg: "work", worker: "CUBE", says: "CUBE builds the cube" },
      ],
    },
  ],
  workers: [
    {
      tag: "CUBE",
      session: "session_01LDpdUGBcEKtg1j13dMLatw",
      repo: "some-ui",
      branches: ["claude/landing-cube"],
      phase: "building",
      log: [{ at: "2026-11-22T20:53:55Z", says: "Pushed the cube." }],
    },
  ],
  cleared: [{ goal: "G1", leg: 1, at: "2026-11-22T22:00:00Z" }],
}

const body = (block: unknown): string =>
  `The run's record.\n\n\`\`\`json run\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`

const problems = (block: unknown): ReadonlyArray<string> => {
  const parsed = parseRunBody(body(block))
  return parsed.ok ? [] : parsed.problems
}

describe("a run issue's body", () => {
  it("reads as its run", () => {
    const parsed = parseRunBody(body(run))
    expect(parsed.ok && parsed.value.goals.map((g) => g.id)).toEqual([
      "G1",
      "G3",
    ])
  })

  it("refuses a leg that waits on a goal the run doesn't list", () => {
    const g = { ...run.goals[0], legs: [{ leg: "goal", goal: "G9" }] }
    expect(problems({ ...run, goals: [g], cleared: [] })).toEqual([
      "goals.0.legs.0: it waits on G9, which the run doesn't list",
    ])
  })

  it("refuses goals that wait on each other", () => {
    const a = { ...run.goals[0], id: "G1", legs: [{ leg: "goal", goal: "G2" }] }
    const b = { ...run.goals[0], id: "G2", legs: [{ leg: "goal", goal: "G1" }] }
    expect(problems({ ...run, goals: [a, b], cleared: [] })).toEqual([
      "goals: G1 waits on itself",
      "goals: G2 waits on itself",
    ])
  })

  it("refuses work by a worker it doesn't list", () => {
    expect(problems({ ...run, workers: [] })).toEqual([
      "goals.1.legs.3: it names CUBE, whom the run doesn't list",
    ])
  })

  it("refuses a step with no ask, and a step of yours that says nothing", () => {
    const g = {
      ...run.goals[0],
      legs: [{ leg: "yours", step: 2 }, { leg: "yours" }],
    }
    expect(problems({ ...run, goals: [g], cleared: [] })).toEqual([
      "goals.0.legs.0: a step needs its ask",
      "goals.0.legs.0: a step of yours with no ask says what it is",
      "goals.0.legs.1: a step of yours with no ask says what it is",
    ])
  })

  it("reads a decision ask as a step of the owner's with no step number", () => {
    const g = {
      ...run.goals[0],
      legs: [
        { leg: "yours", ask: { repo: "some-ui", kind: "issue", number: 2860 } },
      ],
    }
    expect(problems({ ...run, goals: [g], cleared: [] })).toEqual([])
  })

  it("clears only a leg of the owner's or home's", () => {
    expect(
      problems({
        ...run,
        cleared: [{ goal: "G1", leg: 0, at: "2026-11-22T22:00:00Z" }],
      })
    ).toEqual([
      "cleared.0: only a step of yours or home's is cleared here; GitHub says when the rest are done",
    ])
    expect(
      problems({
        ...run,
        cleared: [{ goal: "G1", leg: 7, at: "2026-11-22T22:00:00Z" }],
      })
    ).toEqual(["cleared.0: it clears a leg the run doesn't list"])
  })
})

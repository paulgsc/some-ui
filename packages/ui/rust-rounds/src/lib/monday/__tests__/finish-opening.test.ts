/**
 * `finish` puts no week whose opening isn't the standing set as it stands
 * (C737): a copy that drifts from the set is refused, never written.
 */
import type { RustcRun } from "@rust-rounds/lib/formats"
import { RustcRunSchema } from "@rust-rounds/lib/formats"
import type { Opening } from "@rust-rounds/lib/formats/week"
import { prepare } from "@rust-rounds/lib/monday/bundle"
import { finish } from "@rust-rounds/lib/monday/finish"
import {
  SAMPLE_BRIEF,
  SAMPLE_NOW,
  SAMPLE_RECORDS,
  SAMPLE_TRANSCRIPTS,
  SAMPLE_VALUES,
} from "@rust-rounds/lib/monday/sample"
import sampleRuns from "@rust-rounds/lib/monday/sample/runs.json"
import { openingOfWeek, STANDING_OPENING } from "@rust-rounds/lib/opening"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

vi.mock(import("@rust-rounds/lib/opening"), async (actual) => {
  const real = await actual()
  return { ...real, openingOfWeek: vi.fn(real.openingOfWeek) }
})

const RUNS: Record<string, RustcRun> = z
  .record(z.string(), RustcRunSchema)
  .parse(sampleRuns)

const finished = (): ReturnType<typeof finish> =>
  finish({
    ...prepare({
      now: SAMPLE_NOW,
      brief: SAMPLE_BRIEF,
      records: SAMPLE_RECORDS,
      transcripts: SAMPLE_TRANSCRIPTS,
    }),
    values: SAMPLE_VALUES,
    runs: RUNS,
  })

const REFUSED = `week: its opening isn't the standing set (version ${STANDING_OPENING.version}) as it stands; the routine never writes the opening`

describe("finish, on next week's opening (C737)", () => {
  it("puts the week when its opening is the standing set", () => {
    const done = finished()
    expect(done.ok ? [] : done.problems).toEqual([])
  })

  it.each<[string, (set: Opening) => void]>([
    [
      "an answer's words",
      (set: Opening): void => {
        const [first] = set.exchanges
        if (first !== undefined) first.script = `${first.script} And more.`
      },
    ],
    [
      "its version",
      (set: Opening): void => {
        set.version += 1
      },
    ],
    [
      "a question left out",
      (set: Opening): void => {
        set.exchanges.pop()
      },
    ],
  ])("refuses a week whose copy changed %s", (_, change) => {
    vi.mocked(openingOfWeek).mockImplementationOnce(() => {
      const set = structuredClone(STANDING_OPENING)
      change(set)
      return set
    })
    const done = finished()
    expect(done.ok ? [] : done.problems).toEqual([REFUSED])
  })
})

/**
 * The Jobs walk's story sample (WALK2, #3282; `tests/walk/jobs-week.json`):
 * every answer the stand-in home gives from it is read by the app's own
 * readers, as the phone reads them, so the walk shows a week the app can
 * hold, not one that only looks right in a file. Its routes are laid over
 * the stand-in home's base routes, as `stub-home.mjs --routes` lays them.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Digest } from "@some-ui/job-desk"
import { sampleDigest } from "@some-ui/job-desk/sample"
import sample from "@tests/walk/jobs-week.json"
import { describe, expect, it } from "vitest"

import { exchangeInterviewWeeks } from "@/lib/interview-week/home"
import { isClosed } from "@/lib/interview-week/spec"
import { heldWeeks } from "@/lib/interview-week/store"
import type { JobsRecordPort } from "@/lib/jobs/home"
import { exchangeJobs } from "@/lib/jobs/home"
import type { JobEvent } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import { FROZEN_AT } from "@/lib/snips"

import { BASE_ROUTES, routesOf, standInHome } from "./stand-in-home"

/** As the walk lays them: its sample over the stand-in home's base routes. */
const routes = { ...BASE_ROUTES, ...routesOf(sample) }

const home = standInHome(routes)

describe("the Jobs walk's story sample (WALK2)", () => {
  it("is laid over the stand-in home's base routes", () => {
    expect(Object.keys(routes)).toContain("POST /api/v1/auth/pairing/finish")
    expect(sample.schema).toBe("some-ui.walk-sample/jobs/1")
  })

  it("gives a fresh phone its record and the morning's digest, as the phone reads them", async () => {
    const restored: Array<ReadonlyArray<JobEvent>> = []
    const fetched: Array<ReadonlyArray<Digest>> = []
    const keeping: JobsRecordPort = {
      state: () => EMPTY,
      answered: () => undefined,
      restored: (events) => {
        restored.push(events)
        return true
      },
      fetched: (digests) => {
        fetched.push(digests)
      },
      outgoing: () => null,
      filed: () => false,
      fileRefused: () => undefined,
      noticeFiled: () => undefined,
      noticeRefused: () => undefined,
    }
    expect(await exchangeJobs(keeping, home)).toEqual({ kind: "synced" })
    expect(restored.flat().map((e) => e.type)).toEqual([
      "taken",
      "resume-ready",
      "apply-opened",
      "debrief",
    ])
    const digests = fetched.flat()
    expect(digests.map((d) => d.day)).toEqual([FROZEN_AT.slice(0, 10)])
    const pick = digests[0]?.picks.find((p) => p.id === sample.walk.pickId)
    expect(pick?.posting.title).toBe(sample.walk.title)
    expect(Date.parse(digests[0]?.createdAt ?? "")).toBeLessThan(
      Date.parse(FROZEN_AT)
    )
  })

  it("gives the paste kits job-desk's sample holds, whose details SD1 keeps made up", async () => {
    const fetched: Array<ReadonlyArray<Digest>> = []
    await exchangeJobs(
      {
        state: () => EMPTY,
        answered: () => undefined,
        restored: () => true,
        fetched: (digests) => {
          fetched.push(digests)
        },
        outgoing: () => null,
        filed: () => false,
        fileRefused: () => undefined,
        noticeFiled: () => undefined,
        noticeRefused: () => undefined,
      },
      home
    )
    const kits = fetched.flat().flatMap((d) => d.picks.map((p) => p.kit))
    expect(kits).toEqual(sampleDigest().picks.map((p) => p.kit))
  })

  it("gives it an interview week that reads and is open on the frozen day", async () => {
    const store = heldWeeks(inMemoryStorage())
    expect(await exchangeInterviewWeeks(store, home)).toEqual({
      kind: "synced",
    })
    const { weeks, unread } = store.held()
    expect(unread).toEqual([])
    expect(weeks.map(({ week }) => week.company.name)).toEqual([
      sample.walk.company,
    ])
    for (const { week } of weeks) {
      expect(isClosed(week, FROZEN_AT)).toBe(false)
      expect(Date.parse(week.opens)).toBeLessThanOrEqual(Date.parse(FROZEN_AT))
    }
  })
})

/**
 * The Jobs walk's story sample (WALK2, #3282; `tests/walk/jobs-week.json`):
 * every answer the stand-in home gives from it is read by the app's own
 * readers, as the phone reads them, so the walk shows a week the app can
 * hold, not one that only looks right in a file. Its routes are laid over
 * the stand-in home's base routes, as `stub-home.mjs --routes` lays them.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Digest } from "@some-ui/job-desk"
import { sampleDigest } from "@some-ui/job-desk/sample"
import sample from "@tests/walk/jobs-week.json"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { exchangeInterviewWeeks } from "@/lib/interview-week/home"
import { isClosed } from "@/lib/interview-week/spec"
import { heldWeeks } from "@/lib/interview-week/store"
import type { JobsRecordPort } from "@/lib/jobs/home"
import { exchangeJobs } from "@/lib/jobs/home"
import type { JobEvent } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import { FROZEN_AT } from "@/lib/snips"

/** The stand-in home's base routes (`apps/mobile/compat`), which the sample is laid over. */
const BASE = resolve(
  import.meta.dirname,
  "../../../../../mobile/compat/stub-routes.json"
)

/** A routes file as `stub-home.mjs` reads it. */
const RoutesSchema = z.object({
  routes: z.record(
    z.string(),
    z.object({
      status: z.number().optional(),
      body: z.unknown().optional(),
      echo: z.string().optional(),
    })
  ),
})
type Route = z.infer<typeof RoutesSchema>["routes"][string]

const routes: Readonly<Record<string, Route>> = {
  ...RoutesSchema.parse(JSON.parse(readFileSync(BASE, "utf8"))).routes,
  ...RoutesSchema.parse(sample).routes,
}

/** A route key's path as a pattern, as `stub-home.mjs` reads it: each `:name` is one segment. */
const matches = (key: string, asked: string): boolean =>
  new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-z]+/gi, "[^/]+")}$`
  ).test(asked)

/** The stand-in home, answering as `stub-home.mjs` does, under home's `/api/v1`. */
const home: HomeCall = (method, path, body) => {
  const asked = `${method} /api/v1${path.split("?")[0] ?? ""}`
  const route = Object.hasOwn(routes, asked)
    ? routes[asked]
    : (Object.entries(routes).find(([key]) => matches(key, asked))?.[1] ?? {
        status: 200,
        body: {},
      })
  const answer: HomeAnswer = {
    status: route.status ?? 200,
    body: JSON.stringify(
      route.echo === undefined
        ? (route.body ?? null)
        : { [route.echo]: typeof body === "string" ? JSON.parse(body) : null }
    ),
  }
  return Promise.resolve(answer)
}

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

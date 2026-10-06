/**
 * The sync from home, with a second device backend standing in for the
 * home `file_host` - fair, since the device backend passes the server's own
 * contracts (`conformance.test.ts`) - and with one transport that
 * re-serialises every JSON body the way Capacitor's native HTTP does.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { beforeEach, describe, expect, it } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import { isRecord, sha256Hex } from "@/lib/device-backend/common"
import {
  upsertLesson,
  upsertRound,
  upsertRuns,
} from "@/lib/device-backend/content-store"
import type { HomeGet } from "@/lib/device-backend/home-sync"
import {
  homeApiBase,
  HomeUnreachableError,
  syncFromHome,
} from "@/lib/device-backend/home-sync"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"
import type { SqlDriver } from "@/lib/device-backend/sql"
import type { StorageBudget } from "@/lib/device-backend/storage"
import { databaseBytes } from "@/lib/device-backend/storage"

const HOME = "http://192.168.1.10:3000"
const PHONE = "https://localhost/api/file-host/api/v1"
const NOW = Date.parse("2026-09-29T08:00:00Z")

let homeDb: SqlDriver
let home: DeviceBackend
let phoneDb: SqlDriver
let phone: DeviceBackend

function fetchFor(backend: DeviceBackend, base: string): typeof fetch {
  return createDeviceFetch(
    new URL(base),
    () => Promise.resolve(backend),
    () => Promise.reject(new TypeError("Failed to fetch"))
  )
}

/** Home as the phone reaches it: bytes as served. */
const verbatimGet: HomeGet = async (url) => {
  const response = await fetchFor(home, `${HOME}/api/v1`)(url)
  return { status: response.status, body: await response.text() }
}

/** Home through Capacitor's native HTTP, which parses JSON on the way. */
const reserialisingGet: HomeGet = async (url) => {
  const { status, body } = await verbatimGet(url)
  try {
    return { status, body: JSON.stringify(JSON.parse(body)) }
  } catch {
    return { status, body }
  }
}

const LESSON = {
  key: "k2-cafe",
  displayName: "At the café",
  description: "Ordering",
  batchCount: 2,
  totalQuestions: 6,
  totalMessages: 8,
  difficulty: "intermediate",
  tags: ["food"],
}

/** A round home has and the bundle does not, pretty-printed as authored. */
const HOME_ROUND = JSON.stringify(
  {
    id: "home-only-round",
    diffOptions: [
      { member: { propositionId: "CW-P1", admissible: true } },
      { member: { propositionId: "CW-P2", admissible: false } },
    ],
  },
  null,
  2
)

beforeEach(async () => {
  homeDb = openNodeSqlite()
  home = await openDeviceBackend(homeDb, () => NOW)
  await upsertLesson(homeDb, LESSON, '{\n  "batches": []\n}', NOW)
  await upsertRound(homeDb, HOME_ROUND, NOW, "bundled")
  await upsertRuns(
    homeDb,
    JSON.stringify({
      roundId: "home-only-round",
      contentHash: await sha256Hex(HOME_ROUND),
      runs: [
        {
          variant: "A",
          bounds: "before",
          sizes: { n: 10 },
          result: {
            kind: "ok",
            inputSize: 10,
            observation: {
              output: "1",
              logs: [],
              elapsed: { milliseconds: 1 },
            },
          },
        },
      ],
    }),
    NOW
  )
  phoneDb = openNodeSqlite()
  phone = await openDeviceBackend(phoneDb, () => NOW)
})

async function phoneJson(route: string): Promise<unknown> {
  const response = await fetchFor(phone, PHONE)(`${PHONE}${route}`)
  const body: unknown = await response.json()
  return body
}

describe("syncFromHome", () => {
  it.each([
    ["verbatim", verbatimGet],
    ["re-serialised (native HTTP)", reserialisingGet],
  ] as const)(
    "puts home's lessons and new rounds on the phone, runs included (%s)",
    async (_label, transport) => {
      const report = await syncFromHome(phoneDb, HOME, transport, () => NOW)
      expect(report.failed).toEqual([])
      expect(report.lessons).toMatchObject({ listed: 1, added: 1 })
      expect(report.rounds.added).toBe(1)

      await expect(
        phoneJson("/curriculum/manifest.json")
      ).resolves.toMatchObject({
        topiks: [
          { key: "k2-cafe", difficulty: "intermediate", tags: ["food"] },
        ],
      })
      await expect(phoneJson("/curriculum/k2-cafe")).resolves.toEqual({
        batches: [],
      })
      // The runs follow the round even when its bytes did not survive.
      await expect(
        phoneJson("/leetype/rounds/home-only-round/runs")
      ).resolves.toMatchObject({ runs: [{ variant: "A" }] })
    }
  )

  it("is idempotent, and removes what home stopped listing", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    const again = await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    expect(again.lessons).toMatchObject({ added: 0, updated: 0, removed: 0 })
    expect(again.rounds).toMatchObject({ added: 0, updated: 0, removed: 0 })

    await homeDb.run("UPDATE curriculum SET retired_at = ? WHERE key = ?", [
      "2026-09-29T09:00:00+00:00",
      "k2-cafe",
    ])
    await homeDb.run("UPDATE leetype_round SET retired_at = ? WHERE id = ?", [
      "2026-09-29T09:00:00+00:00",
      "home-only-round",
    ])
    const third = await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    expect(third.lessons.removed).toBe(1)
    expect(third.rounds.removed).toBe(1)
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      {
        topiks: [],
      }
    )
    const rounds = await phoneDb.all(
      "SELECT id FROM leetype_round WHERE id = 'home-only-round'"
    )
    expect(rounds).toEqual([])
  })

  it("skips what would grow the phone past its budget, and counts it", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    const big = { ...LESSON, key: "k3-big", displayName: "Long" }
    await upsertLesson(
      homeDb,
      big,
      JSON.stringify({ batches: ["x".repeat(20_000)] }),
      NOW
    )
    const full: StorageBudget = {
      quotaBytes: await databaseBytes(phoneDb),
      reservedBytes: 0,
    }
    const report = await syncFromHome(
      phoneDb,
      HOME,
      verbatimGet,
      () => NOW,
      full
    )
    expect(report.lessons).toMatchObject({ listed: 2, added: 0, skipped: 1 })
    expect(report.failed).toEqual([])
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      { topiks: [{ key: "k2-cafe" }] }
    )
  })

  it("removes nothing when the rounds listing fails after the lessons'", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    await homeDb.run("UPDATE curriculum SET retired_at = ? WHERE key = ?", [
      "2026-09-29T09:00:00+00:00",
      "k2-cafe",
    ])
    const noRounds: HomeGet = async (url) =>
      url.endsWith("/leetype/rounds")
        ? { status: 500, body: "" }
        : verbatimGet(url)
    await expect(
      syncFromHome(phoneDb, HOME, noRounds, () => NOW)
    ).rejects.toThrow(/500/)
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      { topiks: [{ key: "k2-cafe" }] }
    )
  })

  it("re-lists a lesson an older build retired, once home lists it", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    await phoneDb.run("UPDATE curriculum SET retired_at = ? WHERE key = ?", [
      "2026-09-29T09:00:00+00:00",
      "k2-cafe",
    ])
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      { topiks: [{ key: "k2-cafe" }] }
    )
  })

  it("says home is unreachable, and changes nothing, off the home network", async () => {
    const offline: HomeGet = () =>
      Promise.reject(new TypeError("Failed to fetch"))
    await expect(syncFromHome(phoneDb, HOME, offline)).rejects.toBeInstanceOf(
      HomeUnreachableError
    )
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      {
        topiks: [],
      }
    )
  })

  it("picks up a round's runs on the next sync after their request failed", async () => {
    const noRuns: HomeGet = async (url) =>
      url.endsWith("/runs") ? { status: 500, body: "" } : verbatimGet(url)
    await syncFromHome(phoneDb, HOME, noRuns, () => NOW)
    await expect(
      phoneJson("/leetype/rounds/home-only-round/runs")
    ).resolves.toMatchObject({ runs: [] })

    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    await expect(
      phoneJson("/leetype/rounds/home-only-round/runs")
    ).resolves.toMatchObject({ runs: [{ variant: "A" }] })
  })

  it("keeps a lesson that failed to download, rather than removing it", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    const flaky: HomeGet = async (url) =>
      url.endsWith("/curriculum/k2-cafe")
        ? { status: 500, body: "" }
        : verbatimGet(url)
    const report = await syncFromHome(phoneDb, HOME, flaky, () => NOW)
    expect(report.failed).toEqual(["k2-cafe"])
    expect(report.lessons.removed).toBe(0)
  })
})

describe("syncFromHome against a home it cannot read", () => {
  it("fails on a manifest with no `topiks` array, and removes nothing", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    const skewed: HomeGet = async (url) =>
      url.endsWith("/curriculum/manifest.json")
        ? { status: 200, body: "{}" }
        : verbatimGet(url)
    await expect(
      syncFromHome(phoneDb, HOME, skewed, () => NOW)
    ).rejects.toThrow(/topiks/)
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      { topiks: [{ key: "k2-cafe" }] }
    )
  })

  it("keeps a lesson whose manifest entry it cannot read", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    const partial: HomeGet = async (url) =>
      url.endsWith("/curriculum/manifest.json")
        ? {
            status: 200,
            body: JSON.stringify({ topiks: [{ key: "k2-cafe" }] }),
          }
        : verbatimGet(url)
    const report = await syncFromHome(phoneDb, HOME, partial, () => NOW)
    expect(report.failed).toEqual(["k2-cafe"])
    expect(report.lessons.removed).toBe(0)
  })
})

describe("the bundled seed after a sync", () => {
  it("leaves a round home updated as home's, across a restart", async () => {
    const id = "has-duplicate-sort-adjacent"
    const bundled = await phoneJson(`/leetype/rounds/${id}`)
    if (!isRecord(bundled)) throw new Error("the bundled round is not a record")
    const newer = JSON.stringify({ ...bundled, homeEdit: true })
    await upsertRound(homeDb, newer, NOW, "bundled")
    // Home's run under the same (variant, bounds) key as a bundled one.
    await upsertRuns(
      homeDb,
      JSON.stringify({
        roundId: id,
        contentHash: await sha256Hex(newer),
        runs: [{ variant: "A", bounds: "before", sizes: { n: 99 } }],
      }),
      NOW
    )
    const report = await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    expect(report.rounds.updated).toBe(1)

    // The next start seeds the bundle again, rounds and runs.
    phone = await openDeviceBackend(phoneDb, () => NOW)
    await expect(phoneJson(`/leetype/rounds/${id}`)).resolves.toMatchObject({
      homeEdit: true,
    })
    await expect(
      phoneJson(`/leetype/rounds/${id}/runs`)
    ).resolves.toMatchObject({
      runs: [{ variant: "A", bounds: "before", sizes: { n: 99 } }],
    })
  })
})

describe("a lesson home re-described", () => {
  it("takes home's new name and tags when the body is unchanged", async () => {
    await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    await upsertLesson(
      homeDb,
      { ...LESSON, displayName: "At the café, again", tags: ["food", "k2"] },
      '{\n  "batches": []\n}',
      NOW
    )
    const report = await syncFromHome(phoneDb, HOME, verbatimGet, () => NOW)
    expect(report.lessons.updated).toBe(1)
    await expect(phoneJson("/curriculum/manifest.json")).resolves.toMatchObject(
      {
        topiks: [
          {
            key: "k2-cafe",
            displayName: "At the café, again",
            tags: ["food", "k2"],
          },
        ],
      }
    )
  })
})

describe("homeApiBase", () => {
  it.each([
    ["192.168.1.10:3000", "http://192.168.1.10:3000/api/v1"],
    ["http://nas.local:3000/", "http://nas.local:3000/api/v1"],
    ["https://home.example/api/v1", "https://home.example/api/v1"],
  ])("%s -> %s", (input, expected) => {
    expect(homeApiBase(input)).toBe(expected)
  })
})

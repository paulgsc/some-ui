/**
 * @vitest-environment node
 *
 * Home's record of each move of a Studio take along the conveyor
 * (CONVEYOR1, `../take-stations`): one `POST` per move owed, naming where
 * it was made from, and each answer home can give read as the route means
 * it.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

import {
  sendStationMoves,
  stationBody,
  stationPath,
} from "@/lib/home-link/take-stations"
import type { StationMove } from "@/lib/take-conveyor/model"
import type { TakeConveyor } from "@/lib/take-conveyor/runtime"
import { createTakeConveyor } from "@/lib/take-conveyor/runtime"

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

const AT = "2026-11-13T09:15:00.000Z"

type Sent = Array<[string, string, unknown]>

/** A conveyor holding one move to Cooking of each take named, in order. */
function conveyorWith(takes: ReadonlyArray<string>): TakeConveyor {
  let n = 0
  const conveyor = createTakeConveyor({
    storage: inMemoryStorage(),
    newId: () => `m${String((n += 1))}`,
    now: () => AT,
  })
  for (const take of takes) {
    conveyor.move({
      take,
      from: "in-the-oven",
      to: "cooking",
      labels: ["keep"],
    })
  }
  return conveyor
}

/** Home, answering each move by its take's id; 200 carries the take back. */
function home(
  statuses: Readonly<Record<string, number>>,
  sent: Sent
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    const take = decodeURIComponent(path.split("/")[2] ?? "")
    const status = statuses[take] ?? 200
    const answer =
      status === 200
        ? JSON.stringify({
            change: "moved",
            take: { id: take, station: "cooking", labels: [], history: [] },
          })
        : ""
    return Promise.resolve({ status, body: answer })
  }
}

describe("a move of a take, to home (CONVEYOR1)", () => {
  const move: StationMove = {
    move: "m1",
    take: "a:b",
    from: "cooking",
    to: "ready-for-pickup",
    at: AT,
    labels: ["like it"],
    comment: null,
  }

  it("names the take, encoded, and sends from, to and when, with labels and a comment only when there are", () => {
    expect(stationPath(move)).toBe("/voice-notes/a%3Ab/station")
    expect(JSON.parse(stationBody(move))).toEqual({
      from: "cooking",
      to: "ready-for-pickup",
      at: AT,
      labels: ["like it"],
    })
    expect(
      JSON.parse(stationBody({ ...move, labels: null, comment: "for week 9" }))
    ).toEqual({
      from: "cooking",
      to: "ready-for-pickup",
      at: AT,
      comment: "for week 9",
    })
  })

  it("answers each move home kept, so none goes again", async () => {
    const conveyor = conveyorWith(["t1", "t2"])
    const sent: Sent = []
    expect(await sendStationMoves(conveyor.port, home({}, sent))).toEqual({
      kind: "synced",
    })
    expect(sent.map(([method, path]) => [method, path])).toEqual([
      ["POST", "/voice-notes/t1/station"],
      ["POST", "/voice-notes/t2/station"],
    ])
    expect(conveyor.port.due()).toEqual([])
    expect(conveyor.standing("t1", {})?.going).toBe(false)
  })

  it("counts a move home already holds (unchanged) as kept", async () => {
    const conveyor = conveyorWith(["t1"])
    const again: HomeCall = () =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({
          change: "unchanged",
          take: { id: "t1", station: "cooking", labels: [], history: [] },
        }),
      })
    await sendStationMoves(conveyor.port, again)
    expect(conveyor.port.due()).toEqual([])
  })

  it("keeps a move home didn't find owed, and goes on to the next", async () => {
    const conveyor = conveyorWith(["gone", "t2"])
    const sent: Sent = []
    await sendStationMoves(conveyor.port, home({ gone: 404 }, sent))
    expect(sent).toHaveLength(2)
    expect(conveyor.port.due().map(({ take }) => take)).toEqual(["gone"])
  })

  it("drops a move made from where the take no longer stands, and says so on its row", async () => {
    const conveyor = conveyorWith(["t1"])
    await sendStationMoves(conveyor.port, home({ t1: 409 }, []))
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "canned", stationAt: null })
    ).toMatchObject({
      station: "canned",
      missed: { to: "cooking", why: "stale" },
    })
  })

  it("answers a move home refuses for good, and the take shows where it was", async () => {
    const conveyor = conveyorWith(["t1"])
    await sendStationMoves(conveyor.port, home({ t1: 422 }, []))
    expect(conveyor.port.due()).toEqual([])
    expect(conveyor.standing("t1", {})).toMatchObject({
      station: "in-the-oven",
      missed: { to: "cooking", why: "refused" },
    })
  })

  it("ends the run on a 401, and on an answer it can't read, the move still owed", async () => {
    const forgotten = conveyorWith(["t1", "t2"])
    const sent: Sent = []
    expect(
      await sendStationMoves(forgotten.port, home({ t1: 401 }, sent))
    ).toEqual({ kind: "forgotten" })
    expect(sent).toHaveLength(1)
    expect(forgotten.port.due()).toHaveLength(2)

    const odd = conveyorWith(["t1"])
    expect((await sendStationMoves(odd.port, home({ t1: 500 }, []))).kind).toBe(
      "failed"
    )
    expect(odd.port.due()).toHaveLength(1)
  })

  it("doesn't count a 200 that carries the take back somewhere else", async () => {
    const conveyor = conveyorWith(["t1"])
    const other: HomeCall = () =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({
          change: "moved",
          take: { id: "t1", station: "canned", labels: [], history: [] },
        }),
      })
    expect((await sendStationMoves(conveyor.port, other)).kind).toBe("failed")
    expect(conveyor.port.due()).toHaveLength(1)
  })
})

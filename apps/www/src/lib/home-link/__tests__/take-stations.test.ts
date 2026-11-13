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
      seq: 0,
      to: "cooking",
      labels: ["keep"],
    })
  }
  return conveyor
}

/**
 * Home, answering each move by its take's id; 200 carries the take back. A
 * read of a take's station answers `reads`' body for it, or a 404.
 */
function home(
  statuses: Readonly<Record<string, number>>,
  sent: Sent,
  reads: Readonly<Record<string, unknown>> = {}
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    if (method === "GET") {
      const read = reads[decodeURIComponent(path.split("/")[2] ?? "")]
      return Promise.resolve(
        read === undefined
          ? { status: 404, body: "" }
          : { status: 200, body: JSON.stringify(read) }
      )
    }
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
    seq: 1,
    labels: ["like it"],
    comment: null,
  }

  it("names the take, encoded, and sends from, to and when, with labels and a comment only when there are", () => {
    expect(stationPath(move)).toBe("/voice-notes/a%3Ab/station")
    expect(JSON.parse(stationBody(move))).toEqual({
      from: "cooking",
      to: "ready-for-pickup",
      at: AT,
      seq: 1,
      labels: ["like it"],
    })
    expect(
      JSON.parse(stationBody({ ...move, labels: null, comment: "for week 9" }))
    ).toEqual({
      from: "cooking",
      to: "ready-for-pickup",
      at: AT,
      seq: 1,
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
    expect(
      conveyor.standing("t1", { station: "in-the-oven", stationSeq: 0 })?.going
    ).toBe(false)
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

  it("keeps every move owed, and asks no more, of a home without the route", async () => {
    const conveyor = conveyorWith(["gone", "t2"])
    const sent: Sent = []
    expect(
      await sendStationMoves(conveyor.port, home({ gone: 404 }, sent))
    ).toEqual({ kind: "synced" })
    expect(sent).toHaveLength(1)
    expect(conveyor.port.due().map(({ take }) => take)).toEqual(["gone", "t2"])
  })

  it("keeps a move dated past home's clock owed, with the take's later ones, and goes on to other takes", async () => {
    const conveyor = conveyorWith(["t1", "t2"])
    conveyor.move({ take: "t1", from: "cooking", seq: 1, to: "canned" })
    const sent: Sent = []
    const ahead: HomeCall = (method, path, body) => {
      sent.push([method, path, body])
      if (path.includes("/t1/")) {
        return Promise.resolve({
          status: 422,
          body: JSON.stringify({
            error: { details: { at: ["more than 5 minutes ahead"] } },
          }),
        })
      }
      return home({}, [])(method, path, body)
    }
    await sendStationMoves(conveyor.port, ahead)
    expect(sent.map(([, path]) => path)).toEqual([
      "/voice-notes/t1/station",
      "/voice-notes/t2/station",
    ])
    expect(conveyor.port.due().map(({ move }) => move)).toEqual(["m1", "m3"])
  })

  it("drops a move made from where the take no longer stands, with where home says it is", async () => {
    const conveyor = conveyorWith(["t1"])
    const sent: Sent = []
    await sendStationMoves(
      conveyor.port,
      home({ t1: 409 }, sent, {
        t1: { id: "t1", station: "canned", seq: 2, labels: [], history: [] },
      })
    )
    expect(sent.map(([method]) => method)).toEqual(["POST", "GET"])
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "in-the-oven", stationSeq: 0 })
    ).toMatchObject({
      station: "canned",
      missed: { to: "cooking", why: "stale" },
    })
  })

  it("ends the run with the move owed when home can't read the take back after a 409", async () => {
    for (const [status, kind] of [
      [500, "failed"],
      [429, "failed"],
      [401, "forgotten"],
    ] as const) {
      const conveyor = conveyorWith(["t1"])
      const conflict: HomeCall = (method) =>
        Promise.resolve({ status: method === "POST" ? 409 : status, body: "" })
      expect((await sendStationMoves(conveyor.port, conflict)).kind).toBe(kind)
      expect(conveyor.port.due()).toHaveLength(1)
    }
  })

  it("keeps the move owed when the read after a 409 gets no answer", async () => {
    const conveyor = conveyorWith(["t1"])
    const away: HomeCall = (method) =>
      method === "POST"
        ? Promise.resolve({ status: 409, body: "" })
        : Promise.reject(new Error("no answer"))
    await expect(sendStationMoves(conveyor.port, away)).rejects.toThrow()
    expect(conveyor.port.due()).toHaveLength(1)
  })

  it("sends no later move made along a stale move's chain, or of a take whose move stays owed", async () => {
    const twice = (): TakeConveyor => {
      const conveyor = conveyorWith(["t1"])
      conveyor.move({
        take: "t1",
        from: "cooking",
        seq: 1,
        to: "ready-for-pickup",
      })
      return conveyor
    }
    const stale = twice()
    const sent: Sent = []
    await sendStationMoves(
      stale.port,
      home({ t1: 409 }, sent, {
        t1: { id: "t1", station: "canned", seq: 3, labels: [], history: [] },
      })
    )
    expect(sent.map(([method]) => method)).toEqual(["POST", "GET"])
    expect(stale.port.due()).toEqual([])
    expect(
      stale.standing("t1", { station: "canned", stationSeq: 3 })?.missed
    ).toEqual({ to: "cooking", why: "stale" })

    const ahead = twice()
    const asked: Sent = []
    const late: HomeCall = (method, path, body) => {
      asked.push([method, path, body])
      return Promise.resolve({
        status: 422,
        body: JSON.stringify({ error: { details: { at: ["ahead"] } } }),
      })
    }
    await sendStationMoves(ahead.port, late)
    expect(asked).toHaveLength(1)
    expect(ahead.port.due()).toHaveLength(2)
  })

  it("still sends the chain of a move another device already made, and says nothing missed", async () => {
    const conveyor = (() => {
      const made = conveyorWith(["t1"])
      made.move({ take: "t1", from: "cooking", seq: 1, to: "ready-for-pickup" })
      return made
    })()
    const sent: Sent = []
    let posts = 0
    const call: HomeCall = (method, path, body) => {
      sent.push([method, path, body])
      if (method === "GET") {
        // Home is just where the first move would have put the take.
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({
            id: "t1",
            station: "cooking",
            seq: 1,
            labels: [],
            history: [],
          }),
        })
      }
      posts += 1
      return Promise.resolve(
        posts === 1
          ? { status: 409, body: "{}" }
          : {
              status: 200,
              body: JSON.stringify({
                change: "moved",
                take: { id: "t1", station: "ready-for-pickup", seq: 2 },
              }),
            }
      )
    }
    await sendStationMoves(conveyor.port, call)
    expect(sent.map(([method]) => method)).toEqual(["POST", "GET", "POST"])
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "cooking", stationSeq: 1 })
    ).toMatchObject({ station: "ready-for-pickup", missed: null })
  })

  it("counts a move home already holds as kept, though the take has moved on since", async () => {
    const conveyor = conveyorWith(["t1"])
    await sendStationMoves(
      conveyor.port,
      home({ t1: 409 }, [], {
        t1: {
          id: "t1",
          station: "canned",
          seq: 2,
          labels: [],
          history: [
            {
              seq: 1,
              from: "in-the-oven",
              to: "cooking",
              at: "2026-11-13T09:15:00Z",
            },
            {
              seq: 2,
              from: "cooking",
              to: "canned",
              at: "2026-11-13T10:00:00Z",
            },
          ],
        },
      })
    )
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "canned", stationSeq: 2 })?.missed
    ).toBeNull()
  })

  it("answers a move home refuses for good, and the take shows where it was", async () => {
    const conveyor = conveyorWith(["t1"])
    await sendStationMoves(conveyor.port, home({ t1: 422 }, []))
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "in-the-oven", stationSeq: 0 })
    ).toMatchObject({
      station: "in-the-oven",
      missed: { to: "cooking", why: "refused" },
    })
  })

  it("drops a move of a take home keeps off the conveyor (its own 404), and keeps one a home without the route can't take", async () => {
    const off = conveyorWith(["t1"])
    const notHeld: HomeCall = () =>
      Promise.resolve({
        status: 404,
        body: JSON.stringify({ error: { code: "not_found" } }),
      })
    await sendStationMoves(off.port, notHeld)
    expect(off.port.due()).toEqual([])
    expect(
      off.standing("t1", { station: "in-the-oven", stationSeq: 0 })?.missed
    ).toEqual({ to: "cooking", why: "off" })

    const older = conveyorWith(["t1"])
    await sendStationMoves(older.port, home({ t1: 404 }, []))
    expect(older.port.due()).toHaveLength(1)
  })

  it("still sends a later move made from home's word after an earlier one went stale", async () => {
    const conveyor = conveyorWith(["t1"])
    conveyor.move({
      take: "t1",
      from: "canned",
      seq: 2,
      to: "ready-for-pickup",
    })
    const sent: Sent = []
    let posts = 0
    const call: HomeCall = (method, path, body) => {
      sent.push([method, path, body])
      if (method === "GET") {
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({
            id: "t1",
            station: "canned",
            seq: 2,
            labels: [],
            history: [],
          }),
        })
      }
      posts += 1
      return Promise.resolve(
        posts === 1
          ? { status: 409, body: "{}" }
          : {
              status: 200,
              body: JSON.stringify({
                change: "moved",
                take: { id: "t1", station: "ready-for-pickup", seq: 3 },
              }),
            }
      )
    }
    await sendStationMoves(conveyor.port, call)
    expect(sent.map(([method]) => method)).toEqual(["POST", "GET", "POST"])
    expect(conveyor.port.due()).toEqual([])
    expect(
      conveyor.standing("t1", { station: "canned", stationSeq: 2 })
    ).toMatchObject({ station: "ready-for-pickup", going: false })
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

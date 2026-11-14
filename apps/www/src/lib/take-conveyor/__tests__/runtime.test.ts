/**
 * @vitest-environment node
 *
 * The phone's moves of Studio's takes (CONVEYOR1, `./runtime`): a move is
 * made only once storage keeps it, survives a reload, and is never removed.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { TakeConveyor } from "@/lib/take-conveyor/runtime"
import {
  createTakeConveyor,
  libraryStationsOf,
} from "@/lib/take-conveyor/runtime"
import { TAKE_CONVEYOR_WORDS } from "@/lib/take-conveyor/words"

const AT = "2026-11-13T09:15:00.000Z"

const conveyorOn = (storage: KeyedStorage | null): TakeConveyor => {
  let n = 0
  return createTakeConveyor({
    storage,
    newId: () => `m${String((n += 1))}`,
    now: () => AT,
  })
}

describe("createTakeConveyor", () => {
  it("shows a take nobody moved In the oven, and a moved one where it went", () => {
    const conveyor = conveyorOn(inMemoryStorage())
    expect(
      conveyor.standing("t1", { station: "in-the-oven", stationSeq: 0 })
        ?.station
    ).toBe("in-the-oven")
    expect(
      conveyor.move({
        take: "t1",
        from: "in-the-oven",
        seq: 0,
        to: "ready-for-pickup",
      }).kind
    ).toBe("moved")
    expect(
      conveyor.standing("t1", { station: "in-the-oven", stationSeq: 0 })
    ).toEqual({
      station: "ready-for-pickup",
      at: AT,
      seq: 1,
      going: true,
      missed: null,
    })
  })

  it("keeps every move across a reload, home's answers too", () => {
    const storage = inMemoryStorage()
    const first = conveyorOn(storage)
    first.move({ take: "t1", from: "in-the-oven", seq: 0, to: "cooking" })
    first.port.answered("m1", { kind: "held" })
    first.move({
      take: "t1",
      from: "cooking",
      seq: 1,
      to: "canned",
      comment: "meh",
    })
    const again = conveyorOn(storage)
    expect(again.getSnapshot()).toEqual(first.getSnapshot())
    expect(again.getSnapshot().moves).toHaveLength(2)
    expect(again.port.due().map(({ move }) => move)).toEqual(["m2"])
  })

  it("keeps a stale move and where home found the take across a reload", () => {
    const storage = inMemoryStorage()
    const first = conveyorOn(storage)
    first.move({ take: "t1", from: "in-the-oven", seq: 0, to: "cooking" })
    first.port.answered("m1", {
      kind: "stale",
      there: { station: "canned", seq: 2 },
    })
    const again = conveyorOn(storage)
    expect(again.getSnapshot()).toEqual(first.getSnapshot())
    expect(
      again.standing("t1", { station: "in-the-oven", stationSeq: 0 })
    ).toEqual({
      station: "canned",
      at: null,
      seq: 2,
      going: false,
      missed: { to: "cooking", why: "stale" },
    })
  })

  it("moves nothing storage won't keep, and tells listeners only of a move made", () => {
    const refusing: KeyedStorage = {
      ...inMemoryStorage(),
      setItem: () => {
        throw new Error("full")
      },
    }
    const conveyor = conveyorOn(refusing)
    let told = 0
    conveyor.subscribe(() => {
      told += 1
    })
    expect(
      conveyor.move({
        take: "t1",
        from: "in-the-oven",
        seq: 0,
        to: "ready-for-pickup",
      })
    ).toEqual({
      kind: "unkept",
    })
    expect(conveyor.getSnapshot().moves).toEqual([])
    expect(told).toBe(0)
  })

  it("says why a move can't be made, and makes none", () => {
    const conveyor = conveyorOn(inMemoryStorage())
    expect(
      conveyor.move({ take: "t1", from: "cooking", seq: 1, to: "picked-up" })
    ).toEqual({ kind: "refused", why: "pickup" })
    expect(conveyor.getSnapshot().moves).toEqual([])
  })

  it("tells Takes on home where each take stands, home's word under a later move", () => {
    const conveyor = conveyorOn(inMemoryStorage())
    const stations = libraryStationsOf(conveyor)
    const take = {
      id: "t1",
      ref: "",
      recordedAt: AT,
      storedAt: AT,
      size: 1,
      setAsideAt: null,
      heard: null,
    }
    const words = TAKE_CONVEYOR_WORDS.standing
    // A home before the conveyor says nothing, and the phone moved nothing.
    expect(stations.standing(take)).toBeNull()
    expect(stations.standing({ ...take, station: "in-the-oven" })).toBe(
      words({
        station: "in-the-oven",
        at: null,
        seq: 0,
        going: false,
        missed: null,
      })
    )
    expect(
      stations.standing({ ...take, station: "a station not known yet" })
    ).toBeNull()
    // An idea's answer is on no conveyor: its row says nothing of one.
    expect(stations.standing({ ...take, station: null })).toBeNull()
    const before = stations.getSnapshot()
    conveyor.move({ take: "t1", from: "in-the-oven", seq: 0, to: "cooking" })
    expect(stations.getSnapshot()).not.toBe(before)
    expect(
      stations.standing({
        ...take,
        station: "ready-for-pickup",
        stationAt: "2026-11-01T00:00:00.000Z",
      })
    ).toBe(
      words({ station: "cooking", at: AT, seq: 0, going: true, missed: null })
    )
  })
})

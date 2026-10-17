import { claimedRoom, setStorageRoom, withRoom } from "@voice-capture/lib/room"
import { afterEach, describe, expect, it } from "vitest"

afterEach(() => {
  setStorageRoom(() => Promise.resolve(true))
})

const full = (): Error => new Error("full")

describe("withRoom", () => {
  it("writes only when the check passes, asked for the write's growth", async () => {
    const asked: Array<number> = []
    setStorageRoom((bytes) => {
      asked.push(bytes)
      return Promise.resolve(bytes <= 100)
    })
    await expect(
      withRoom(100, () => Promise.resolve("kept"), full)
    ).resolves.toBe("kept")
    let wrote = false
    await expect(
      withRoom(
        101,
        () => {
          wrote = true
          return Promise.resolve()
        },
        full
      )
    ).rejects.toThrow("full")
    expect(wrote).toBe(false)
    // A write that frees more than it adds grows nothing.
    await withRoom(-50, () => Promise.resolve(), full)
    expect(asked).toEqual([100, 101, 0])
  })

  it("counts what overlapping writes claimed, until each settles", async () => {
    const asked: Array<number> = []
    setStorageRoom((bytes) => {
      asked.push(bytes)
      return Promise.resolve(true)
    })
    let settle: () => void = () => undefined
    const first = withRoom(
      30,
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
      full
    )
    await Promise.resolve()
    expect(claimedRoom()).toBe(30)
    await withRoom(20, () => Promise.resolve(), full)
    expect(asked).toEqual([30, 50])
    settle()
    await first
    expect(claimedRoom()).toBe(0)
  })

  it("lets a write through when the check cannot measure", async () => {
    setStorageRoom(() => Promise.reject(new Error("no database")))
    await expect(withRoom(1, () => Promise.resolve(1), full)).resolves.toBe(1)
    expect(claimedRoom()).toBe(0)
  })
})

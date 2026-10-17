import { fitsRoom, setStorageRoom } from "@voice-capture/lib/room"
import { afterEach, describe, expect, it } from "vitest"

afterEach(() => {
  setStorageRoom(() => Promise.resolve(true))
})

describe("fitsRoom", () => {
  it("asks the installed check, with the bytes a write adds", async () => {
    const asked: Array<number> = []
    setStorageRoom((bytes) => {
      asked.push(bytes)
      return Promise.resolve(bytes <= 100)
    })
    await expect(fitsRoom(100)).resolves.toBe(true)
    await expect(fitsRoom(101)).resolves.toBe(false)
    expect(asked).toEqual([100, 101])
  })

  it("lets a write through when the check cannot measure", async () => {
    setStorageRoom(() => Promise.reject(new Error("no database")))
    await expect(fitsRoom(1)).resolves.toBe(true)
  })
})

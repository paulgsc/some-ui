import {
  ENFORCEMENT_FLAG_KEY,
  ENFORCEMENT_FLAG_READ_MS,
  readEnforcementFlag,
} from "@filter/lib/content/enforcement-flag"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
})

describe("readEnforcementFlag", () => {
  it("reads true only for a stored true", async () => {
    await expect(
      readEnforcementFlag(() =>
        Promise.resolve({ [ENFORCEMENT_FLAG_KEY]: true })
      )
    ).resolves.toBe(true)
    await expect(
      readEnforcementFlag(() =>
        Promise.resolve({ [ENFORCEMENT_FLAG_KEY]: "true" })
      )
    ).resolves.toBe(false)
    await expect(readEnforcementFlag(() => Promise.resolve({}))).resolves.toBe(
      false
    )
  })

  it("reads an unreadable store as off, whether it rejects or throws", async () => {
    await expect(
      readEnforcementFlag(() => Promise.reject(new Error("no storage")))
    ).resolves.toBe(false)
    await expect(
      readEnforcementFlag(() => {
        throw new Error("no storage")
      })
    ).resolves.toBe(false)
  })

  it("reads a store that never answers as off at ENFORCEMENT_FLAG_READ_MS (ADR 0002 §8.7)", async () => {
    vi.useFakeTimers()
    let settled: boolean | null = null
    void readEnforcementFlag(() => new Promise(() => {})).then((flag) => {
      settled = flag
    })

    await vi.advanceTimersByTimeAsync(ENFORCEMENT_FLAG_READ_MS - 1)
    expect(settled).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(false)
  })

  it("a late answer after the timeout changes nothing", async () => {
    vi.useFakeTimers()
    let answer: (value: Record<string, unknown>) => void = () => {}
    const flag = readEnforcementFlag(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    await vi.advanceTimersByTimeAsync(ENFORCEMENT_FLAG_READ_MS)
    answer({ [ENFORCEMENT_FLAG_KEY]: true })
    await expect(flag).resolves.toBe(false)
  })
})

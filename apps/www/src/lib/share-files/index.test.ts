/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  installShareSidecar,
  runsNatively,
  shareFiles,
} from "@/lib/share-files"

const share = vi.hoisted(() => vi.fn())

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: { rmdir: (): Promise<void> => Promise.resolve() },
}))
vi.mock("@capacitor/share", () => ({ Share: { share } }))

beforeEach(() => {
  // A failure is reported (`reportFailure`); the console line is not under test.
  vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
  share.mockReset().mockResolvedValue({})
})

describe("shareFiles", () => {
  it("treats backing out of the sheet as cancelled, a missing plugin as unavailable, and anything else as a failure", async () => {
    await expect(shareFiles("out", "t", [])).resolves.toEqual({
      status: "succeeded",
      value: "shared",
    })

    share.mockRejectedValueOnce(new Error("Share canceled"))
    await expect(shareFiles("out", "t", [])).resolves.toEqual({
      status: "succeeded",
      value: "cancelled",
    })

    share.mockRejectedValueOnce({ code: "UNIMPLEMENTED" })
    await expect(shareFiles("out", "t", [])).resolves.toMatchObject({
      status: "failed",
      error: { kind: "unavailable", retryable: false },
    })

    share.mockRejectedValueOnce(
      new Error("Can't share while sharing is in progress")
    )
    await expect(shareFiles("out", "t", [])).resolves.toMatchObject({
      status: "failed",
      error: { kind: "unknown", retryable: true },
    })
  })

  it("runs shares to one place one at a time, so none deletes files a sheet holds", async () => {
    let close: () => void = () => undefined
    share.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          close = resolve
        })
    )
    const first = shareFiles("out", "t", [])
    const second = shareFiles("out", "t", [])
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce())
    close()
    await expect(first).resolves.toMatchObject({ value: "shared" })
    await expect(second).resolves.toMatchObject({ value: "shared" })
    expect(share).toHaveBeenCalledTimes(2)
  })

  it("tells the sidecar when a sheet opens and when it settles, and shares the same when the sidecar throws", async () => {
    const events: Array<string> = []
    let close: () => void = () => undefined
    share.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          close = resolve
        })
    )
    installShareSidecar({
      opening: (dir) => {
        events.push(`open ${dir}`)
        return (): void => {
          events.push(`settle ${dir}`)
        }
      },
    })
    const shared = shareFiles("out", "t", [])
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(events).toEqual(["open out"])
    close()
    await expect(shared).resolves.toMatchObject({ value: "shared" })
    await vi.waitFor(() => expect(events).toEqual(["open out", "settle out"]))

    installShareSidecar({
      opening: () => {
        throw new Error("sidecar")
      },
    })
    await expect(shareFiles("out", "t", [])).resolves.toMatchObject({
      value: "shared",
    })
    installShareSidecar(undefined)
  })
})

describe("runsNatively", () => {
  it("asks the native bridge's Capacitor global, and is false without one", () => {
    expect(runsNatively({})).toBe(false)
    expect(runsNatively({ Capacitor: {} })).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => false } })
    ).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => true } })
    ).toBe(true)
  })
})

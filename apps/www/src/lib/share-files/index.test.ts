/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { shareFiles } from "@/lib/share-files"

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
})

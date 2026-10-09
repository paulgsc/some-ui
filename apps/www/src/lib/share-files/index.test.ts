/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { shareFiles } from "@/lib/share-files"

const written = vi.hoisted(() => new Map<string, string>())
const share = vi.hoisted(() => vi.fn())

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    rmdir: (): Promise<never> => Promise.reject(new Error("no such directory")),
    writeFile: ({
      path,
      data,
    }: {
      path: string
      data: string
    }): Promise<{ uri: string }> => {
      written.set(path, data)
      return Promise.resolve({ uri: `file:///cache/${path}` })
    },
  },
}))
vi.mock("@capacitor/share", () => ({ Share: { share } }))

beforeEach(() => {
  // A failure is reported (`reportFailure`); the console line is not under test.
  vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
  written.clear()
  share.mockReset().mockResolvedValue({})
})

describe("shareFiles", () => {
  it("writes text as itself and a blob as base64, then shares them", async () => {
    await expect(
      shareFiles("out", "A title", [
        { name: "a.md", data: "# 안녕" },
        { name: "b.webm", data: new Blob(["opus"]) },
      ])
    ).resolves.toEqual({ status: "succeeded", value: "shared" })
    expect(written.get("out/a.md")).toBe("# 안녕")
    expect(written.get("out/b.webm")).toBe(btoa("opus"))
    expect(share).toHaveBeenCalledWith({
      title: "A title",
      files: ["file:///cache/out/a.md", "file:///cache/out/b.webm"],
    })
  })

  it("treats backing out of the sheet as cancelled, a missing plugin as unavailable, and anything else as a failure", async () => {
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
})

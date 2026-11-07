/**
 * @vitest-environment node
 *
 * Studio's Calls' runtime over fake ports: a video comes to the phone a part
 * at a time only on Watch, a week already kept is ready without asking home,
 * a link home would refuse is never sent, and what fails says why.
 */
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

import type { ListState, Week } from "@/lib/call-videos/model"
import type { CallsPorts, VideoFiles } from "@/lib/call-videos/runtime"
import { createCallVideos } from "@/lib/call-videos/runtime"

const week = (over: Partial<Week> = {}): Week => ({
  from: "2026-10-30",
  to: "2026-11-05",
  videoBytes: 10,
  restBytes: 5,
  link: null,
  receipts: [],
  ...over,
})

/** `n` bytes as base64. */
const bytes = (n: number): string => Buffer.alloc(n).toString("base64")

type Fakes = {
  ports: {
    list: Mock<CallsPorts["list"]>
    part: Mock<CallsPorts["part"]>
    files: {
      size: Mock<VideoFiles["size"]>
      put: Mock<VideoFiles["put"]>
      where: Mock<VideoFiles["where"]>
      remove: Mock<VideoFiles["remove"]>
    }
    share: Mock<CallsPorts["share"]>
    saveLink: Mock<CallsPorts["saveLink"]>
    partBytes: number
  }
  kept: Map<string, number>
}

function fakes(list: ListState = { kind: "read", weeks: [week()] }): Fakes {
  const kept = new Map<string, number>()
  const ports = {
    list: vi.fn<CallsPorts["list"]>(() => Promise.resolve(list)),
    part: vi.fn<CallsPorts["part"]>((_from, start, end) =>
      Promise.resolve({
        kind: "bytes" as const,
        base64: bytes(end - start + 1),
      })
    ),
    files: {
      size: vi.fn<VideoFiles["size"]>((from) =>
        Promise.resolve(kept.get(from) ?? null)
      ),
      put: vi.fn<VideoFiles["put"]>((from, base64, first) => {
        const got = Buffer.from(base64, "base64").length
        kept.set(from, (first ? 0 : (kept.get(from) ?? 0)) + got)
        return Promise.resolve(true)
      }),
      where: vi.fn<VideoFiles["where"]>((from) =>
        Promise.resolve(
          kept.has(from)
            ? {
                uri: `file:///${from}.mp4`,
                src: `/_capacitor_file_/${from}.mp4`,
              }
            : null
        )
      ),
      remove: vi.fn<VideoFiles["remove"]>((from) => {
        kept.delete(from)
        return Promise.resolve(true)
      }),
    },
    share: vi.fn<CallsPorts["share"]>(() => Promise.resolve("shared")),
    saveLink: vi.fn<CallsPorts["saveLink"]>(() =>
      Promise.resolve({
        kind: "saved" as const,
        url: "https://youtu.be/dQw4w9WgXcQ",
      })
    ),
    partBytes: 4,
  }
  return { ports, kept }
}

describe("createCallVideos", () => {
  it("reads the list on open, and fetches nothing until Watch", async () => {
    const { ports } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    expect(calls.getSnapshot().list).toEqual({ kind: "read", weeks: [week()] })
    expect(ports.part).not.toHaveBeenCalled()
    expect(calls.getSnapshot().fetches).toEqual({})
  })

  it("brings a video to the phone a part at a time, then hands its address", async () => {
    const { ports } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.watch("2026-10-30")
    expect(ports.part.mock.calls.map(([, start, end]) => [start, end])).toEqual(
      [
        [0, 3],
        [4, 7],
        [8, 9],
      ]
    )
    expect(ports.files.put.mock.calls.map(([, , first]) => first)).toEqual([
      true,
      false,
      false,
    ])
    expect(calls.getSnapshot().fetches["2026-10-30"]).toEqual({
      kind: "ready",
      uri: "file:///2026-10-30.mp4",
      src: "/_capacitor_file_/2026-10-30.mp4",
    })
    // Already ready: Watch asks nothing more.
    await calls.watch("2026-10-30")
    expect(ports.part).toHaveBeenCalledTimes(3)
  })

  it("fetches a week once when Watch is pressed twice at once", async () => {
    const { ports, kept } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await Promise.all([calls.watch("2026-10-30"), calls.watch("2026-10-30")])
    expect(ports.part).toHaveBeenCalledTimes(3)
    expect(kept.get("2026-10-30")).toBe(10)
    expect(calls.getSnapshot().fetches["2026-10-30"]?.kind).toBe("ready")
  })

  it("reads a week the phone already keeps whole as ready, without asking home for it", async () => {
    const { ports, kept } = fakes()
    kept.set("2026-10-30", 10)
    const calls = createCallVideos(ports)
    await calls.open()
    expect(calls.getSnapshot().fetches["2026-10-30"]?.kind).toBe("ready")
    expect(ports.part).not.toHaveBeenCalled()
  })

  it("forgets a ready week whose file the phone no longer has, so Watch fetches it again", async () => {
    const { ports, kept } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.watch("2026-10-30")
    expect(calls.getSnapshot().fetches["2026-10-30"]?.kind).toBe("ready")
    kept.delete("2026-10-30")
    await calls.open()
    expect(calls.getSnapshot().fetches["2026-10-30"]).toBeUndefined()
    await calls.watch("2026-10-30")
    expect(ports.part).toHaveBeenCalledTimes(6)
    expect(calls.getSnapshot().fetches["2026-10-30"]?.kind).toBe("ready")
  })

  it("lets go of the phone's copy once home's went, and forgets it was ready", async () => {
    const { ports, kept } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.watch("2026-10-30")
    await calls.forget("2026-10-30")
    expect(kept.has("2026-10-30")).toBe(false)
    expect(calls.getSnapshot().fetches["2026-10-30"]).toBeUndefined()
  })

  it("stops a fetch it lets go of, and removes the copy after the write it was in", async () => {
    const { ports, kept } = fakes()
    let finishPut = (): void => undefined
    ports.files.put.mockImplementationOnce((from, base64) => {
      const got = Buffer.from(base64, "base64").length
      return new Promise((resolve) => {
        finishPut = (): void => {
          kept.set(from, got)
          resolve(true)
        }
      })
    })
    const calls = createCallVideos(ports)
    await calls.open()
    const watching = calls.watch("2026-10-30")
    await vi.waitFor(() => expect(ports.files.put).toHaveBeenCalled())
    const forgetting = calls.forget("2026-10-30")
    finishPut()
    await Promise.all([watching, forgetting])
    expect(kept.has("2026-10-30")).toBe(false)
    expect(ports.part).toHaveBeenCalledTimes(1)
    expect(calls.getSnapshot().fetches["2026-10-30"]).toBeUndefined()
  })

  it("keeps a copy that wouldn't go ready to watch", async () => {
    const { ports } = fakes()
    ports.files.remove.mockResolvedValueOnce(false)
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.watch("2026-10-30")
    const ready = calls.getSnapshot().fetches["2026-10-30"]
    await calls.forget("2026-10-30")
    expect(calls.getSnapshot().fetches["2026-10-30"]).toEqual(ready)
  })

  it("says why a fetch failed: home gone quiet, the video gone, or the phone full", async () => {
    const away = fakes()
    away.ports.part.mockResolvedValueOnce({ kind: "away" })
    const a = createCallVideos(away.ports)
    await a.open()
    await a.watch("2026-10-30")
    expect(a.getSnapshot().fetches["2026-10-30"]).toEqual({
      kind: "failed",
      why: "away",
    })

    const gone = fakes()
    gone.ports.part.mockResolvedValueOnce({ kind: "gone" })
    const g = createCallVideos(gone.ports)
    await g.open()
    await g.watch("2026-10-30")
    expect(g.getSnapshot().fetches["2026-10-30"]).toEqual({
      kind: "failed",
      why: "gone",
    })

    const full = fakes()
    full.ports.files.put.mockResolvedValueOnce(false)
    const f = createCallVideos(full.ports)
    await f.open()
    await f.watch("2026-10-30")
    expect(f.getSnapshot().fetches["2026-10-30"]).toEqual({
      kind: "failed",
      why: "phone",
    })
    // Watch again starts over.
    await f.watch("2026-10-30")
    expect(f.getSnapshot().fetches["2026-10-30"]?.kind).toBe("ready")
  })

  it("never fetches a week with no video", async () => {
    const { ports } = fakes({
      kind: "read",
      weeks: [week({ videoBytes: null })],
    })
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.watch("2026-10-30")
    expect(ports.part).not.toHaveBeenCalled()
  })

  it("never sends a link home would refuse, and reads the list again once one is saved", async () => {
    const { ports } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.saveLink("2026-10-30", "https://www.youtube.com/@paulgsc")
    expect(ports.saveLink).not.toHaveBeenCalled()
    expect(calls.getSnapshot().links["2026-10-30"]).toEqual({
      kind: "notAVideo",
    })

    await calls.saveLink("2026-10-30", " https://youtu.be/dQw4w9WgXcQ ")
    expect(ports.saveLink).toHaveBeenCalledWith(
      "2026-10-30",
      "https://youtu.be/dQw4w9WgXcQ"
    )
    expect(calls.getSnapshot().said).toEqual({
      kind: "linkSaved",
      from: "2026-10-30",
    })
    expect(ports.list).toHaveBeenCalledTimes(2)
  })

  it("shares only a video the phone has, and says when the sheet failed", async () => {
    const { ports } = fakes()
    const calls = createCallVideos(ports)
    await calls.open()
    await calls.share("2026-10-30")
    expect(ports.share).not.toHaveBeenCalled()
    await calls.watch("2026-10-30")
    ports.share.mockResolvedValueOnce("failed")
    await calls.share("2026-10-30")
    expect(ports.share).toHaveBeenCalledWith(
      "file:///2026-10-30.mp4",
      "2026-10-30"
    )
    expect(calls.getSnapshot().said).toEqual({
      kind: "shareFailed",
      from: "2026-10-30",
    })
  })
})

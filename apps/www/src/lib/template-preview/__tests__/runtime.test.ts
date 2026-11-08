/**
 * @vitest-environment node
 *
 * A template's preview's runtime over fake ports (SFEED12): Preview asks home
 * once and reads again, Watch brings the ready preview over a part at a
 * time, a copy already kept is ready without asking home, and a read that
 * finds a newer preview stops the old one's fetch.
 */
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

import type { VideoFiles } from "@/lib/call-videos/runtime"
import type { HomeState, Preview } from "@/lib/template-preview/model"
import type { PreviewPorts } from "@/lib/template-preview/runtime"
import { createTemplatePreview } from "@/lib/template-preview/runtime"

const ready = (over: Partial<Preview> = {}): Preview => ({
  id: "conference-call-1",
  version: 2,
  state: "ready",
  made_at: 1,
  expires_at: 2,
  bytes: 10,
  ...over,
})

const bytes = (n: number): string => Buffer.alloc(n).toString("base64")

function fakes(home: HomeState = { kind: "read", preview: ready() }): {
  ports: PreviewPorts & {
    read: Mock<PreviewPorts["read"]>
    make: Mock<PreviewPorts["make"]>
    part: Mock<PreviewPorts["part"]>
  }
  kept: Map<string, number>
  setHome: (next: HomeState) => void
} {
  let now = home
  const kept = new Map<string, number>()
  const files: VideoFiles = {
    size: (key) => Promise.resolve(kept.get(key) ?? null),
    put: (key, base64, first) => {
      const got = Buffer.from(base64, "base64").length
      kept.set(key, (first ? 0 : (kept.get(key) ?? 0)) + got)
      return Promise.resolve(true)
    },
    where: (key) =>
      Promise.resolve(
        kept.has(key) ? { uri: `file:///${key}`, src: `/f/${key}` } : null
      ),
    remove: (key) => Promise.resolve(kept.delete(key) || true),
  }
  return {
    ports: {
      read: vi.fn<PreviewPorts["read"]>(() => Promise.resolve(now)),
      make: vi.fn<PreviewPorts["make"]>(() =>
        Promise.resolve({ kind: "asked" as const })
      ),
      part: vi.fn<PreviewPorts["part"]>((_id, start, end) =>
        Promise.resolve({
          kind: "bytes" as const,
          base64: bytes(end - start + 1),
        })
      ),
      files,
      partBytes: 4,
    },
    kept,
    setHome: (next): void => {
      now = next
    },
  }
}

describe("a template's preview", () => {
  it("asks home once per press, and reads again once home said yes", async () => {
    const { ports } = fakes({ kind: "read", preview: null })
    const preview = createTemplatePreview(ports)
    await Promise.all([preview.make(), preview.make()])
    expect(ports.make).toHaveBeenCalledTimes(1)
    expect(ports.read).toHaveBeenCalledTimes(1)
  })

  it("reads nothing again when home didn't take the press, and says why", async () => {
    const { ports } = fakes()
    ports.make.mockResolvedValue({ kind: "older" })
    const preview = createTemplatePreview(ports)
    await preview.make()
    expect(ports.read).not.toHaveBeenCalled()
    expect(preview.getSnapshot().said).toEqual({
      kind: "makeFailed",
      why: "older",
    })
  })

  it("brings the ready preview over a part at a time on Watch, then plays it", async () => {
    const { ports } = fakes()
    const preview = createTemplatePreview(ports)
    await preview.open()
    expect(ports.part).not.toHaveBeenCalled()
    await preview.watch()
    expect(ports.part.mock.calls).toEqual([
      ["conference-call-1", 0, 3],
      ["conference-call-1", 4, 7],
      ["conference-call-1", 8, 9],
    ])
    expect(preview.getSnapshot().fetch).toEqual({
      id: "conference-call-1",
      fetch: {
        kind: "ready",
        uri: "file:///conference-call-1",
        src: "/f/conference-call-1",
      },
    })
  })

  it("is ready at once when the phone already keeps the whole preview", async () => {
    const { ports, kept } = fakes()
    kept.set("conference-call-1", 10)
    const preview = createTemplatePreview(ports)
    await preview.open()
    expect(preview.getSnapshot().fetch?.fetch.kind).toBe("ready")
    await preview.watch()
    expect(ports.part).not.toHaveBeenCalled()
  })

  it("stops bringing a preview over once a read finds a newer one, and lets its copy go", async () => {
    const { ports, kept, setHome } = fakes()
    const preview = createTemplatePreview(ports)
    await preview.open()
    const first = ports.part.getMockImplementation()
    let parts = 0
    ports.part.mockImplementation(async (id, start, end) => {
      parts += 1
      // After the first part is written, home holds a newer preview.
      if (parts === 2) {
        expect(kept.get("conference-call-1")).toBe(4)
        setHome({ kind: "read", preview: ready({ id: "conference-call-2" }) })
        await preview.open()
      }
      return first ? first(id, start, end) : { kind: "away" }
    })
    await preview.watch()
    expect(parts).toBe(2)
    expect(preview.getSnapshot().fetch).toBeNull()
    expect(kept.has("conference-call-1")).toBe(false)
  })

  it("stops a Watch pressed while a read that finds a newer preview is out", async () => {
    const { ports, kept, setHome } = fakes()
    const preview = createTemplatePreview(ports)
    await preview.open()
    let land: (home: HomeState) => void = () => undefined
    ports.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          land = resolve
        })
    )
    const reading = preview.open()
    const watching = preview.watch()
    land({ kind: "read", preview: ready({ id: "conference-call-2" }) })
    setHome({ kind: "read", preview: ready({ id: "conference-call-2" }) })
    await Promise.all([reading, watching])
    expect(preview.getSnapshot().fetch).toBeNull()
    expect(kept.has("conference-call-1")).toBe(false)
    // The newer preview's Watch works.
    await preview.watch()
    expect(preview.getSnapshot().fetch).toMatchObject({
      id: "conference-call-2",
      fetch: { kind: "ready" },
    })
  })

  it("keeps a preview being watched on the page when a read again gets no answer", async () => {
    const { ports, kept, setHome } = fakes()
    const preview = createTemplatePreview(ports)
    await preview.open()
    await preview.watch()
    setHome({ kind: "away" })
    await preview.open()
    expect(kept.has("conference-call-1")).toBe(true)
  })

  it("says why a fetch failed: home let the preview go", async () => {
    const { ports } = fakes()
    ports.part.mockResolvedValue({ kind: "gone" })
    const preview = createTemplatePreview(ports)
    await preview.open()
    await preview.watch()
    expect(preview.getSnapshot().fetch?.fetch).toEqual({
      kind: "failed",
      why: "gone",
    })
  })
})

/**
 * @vitest-environment node
 *
 * A cards essay's video (CARDS7): which essay the board lists under a key,
 * with its size where home said it; Watch brings it over a part at a time and
 * only once, a copy the phone already keeps plays without asking home, and a
 * copy the cache lost is forgotten. Its words name no machinery.
 */
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

import type { VideoFiles } from "@/lib/call-videos/runtime"
import { essayOf, INITIAL, step } from "@/lib/cards-essay-video/model"
import type { EssayVideoPorts } from "@/lib/cards-essay-video/runtime"
import { createEssayVideo } from "@/lib/cards-essay-video/runtime"
import { ESSAY_WORDS } from "@/lib/cards-essay-video/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Board } from "@/lib/renders/model"

const KEY = "rust-scratchpad-2026-11-14"

const board = (done: Board["done"]): Board => ({
  now: null,
  waiting: [],
  failed: [],
  done,
  coming: [],
})

const bytes = (n: number): string => Buffer.alloc(n).toString("base64")

function fakes(): {
  ports: EssayVideoPorts & { part: Mock<EssayVideoPorts["part"]> }
  kept: Map<string, number>
} {
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
      part: vi.fn<EssayVideoPorts["part"]>((start, end) =>
        Promise.resolve({
          kind: "bytes" as const,
          base64: bytes(end - start + 1),
        })
      ),
      files,
      partBytes: 4,
    },
    kept,
  }
}

describe("which essay the board lists", () => {
  it("is a finished row on the cards-essay shelf, with its size where home said it", () => {
    const at = 1
    expect(
      essayOf(board([{ feed: "cards-essay", key: KEY, at, bytes: 10 }]), KEY)
    ).toEqual({ kind: "done", bytes: 10 })
    expect(
      essayOf(board([{ feed: "cards-essay", key: KEY, at }]), KEY)
    ).toEqual({ kind: "done", bytes: null })
    expect(essayOf(board([{ feed: "call", key: KEY, at }]), KEY)).toEqual({
      kind: "notYet",
    })
    expect(essayOf(board([]), KEY)).toEqual({ kind: "notYet" })
  })

  it("says an essay home couldn't make failed, not that it isn't finished", () => {
    const failed: Board = {
      ...board([]),
      failed: [
        {
          feed: "cards-essay",
          key: KEY,
          at: 1,
          by: "recorder",
          exit: 1,
        },
      ],
    }
    expect(essayOf(failed, KEY)).toEqual({ kind: "failed" })
  })

  it("forgets only a copy that was ready", () => {
    const fetching = step(INITIAL, {
      type: "fetchMoved",
      fetch: { kind: "fetching", done: 0, total: 10 },
    })
    expect(step(fetching, { type: "fetchForgotten" })).toBe(fetching)
    const ready = step(INITIAL, {
      type: "fetchMoved",
      fetch: { kind: "ready", uri: "u", src: "s" },
    })
    expect(step(ready, { type: "fetchForgotten" })).toEqual(INITIAL)
  })
})

describe("a cards essay's video", () => {
  it("comes over a part at a time on Watch, once however often it is pressed", async () => {
    const { ports, kept } = fakes()
    const video = createEssayVideo(KEY, ports)
    await Promise.all([video.watch(10), video.watch(10)])
    expect(ports.part.mock.calls).toEqual([
      [0, 3],
      [4, 7],
      [8, 9],
    ])
    expect(kept.get(KEY)).toBe(10)
    expect(video.getSnapshot().fetch).toEqual({
      kind: "ready",
      uri: `file:///${KEY}`,
      src: `/f/${KEY}`,
    })
    await video.watch(10)
    expect(ports.part).toHaveBeenCalledTimes(3)
  })

  it("plays a whole copy the phone keeps without asking home, and not a partial one", async () => {
    const { ports, kept } = fakes()
    kept.set(KEY, 6)
    const video = createEssayVideo(KEY, ports)
    await video.look(10)
    expect(video.getSnapshot().fetch).toBeUndefined()
    kept.set(KEY, 10)
    await video.look(10)
    expect(video.getSnapshot().fetch?.kind).toBe("ready")
    expect(ports.part).not.toHaveBeenCalled()
  })

  it("forgets a copy the cache lost", async () => {
    const { ports, kept } = fakes()
    kept.set(KEY, 10)
    const video = createEssayVideo(KEY, ports)
    await video.look(10)
    kept.clear()
    await video.look(10)
    expect(video.getSnapshot().fetch).toBeUndefined()
  })

  it("says home has it no longer when a part comes back gone", async () => {
    const { ports } = fakes()
    ports.part.mockResolvedValueOnce({ kind: "gone" })
    const video = createEssayVideo(KEY, ports)
    await video.watch(10)
    expect(video.getSnapshot().fetch).toEqual({ kind: "failed", why: "gone" })
  })
})

describe("ESSAY_WORDS", () => {
  it("name no machinery", () => {
    for (const line of Object.values(ESSAY_WORDS))
      expect(line).not.toMatch(MACHINERY)
  })
})

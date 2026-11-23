/**
 * @vitest-environment node
 *
 * Reading what uses each take (INUSE, TU1): a store this phone can't read,
 * or one not handed in, reads as unread, and a list's read overtaken by a
 * newer one is dropped.
 */
import { describe, expect, it, vi } from "vitest"

import type { StudioUseStores, UsePorts } from "@/lib/take-uses/runtime"
import { createTakeUses } from "@/lib/take-uses/runtime"

const ports = (over: Partial<UsePorts> = {}): UsePorts => ({
  spoken: () => ({ value: [], setAside: [] }),
  interview: () => ({ value: [], setAside: [] }),
  rust: () => ({ value: [], setAside: [] }),
  studio: () => null,
  onStudio: () => () => undefined,
  failed: vi.fn(),
  ...over,
})

const studio = (over: Partial<StudioUseStores> = {}): StudioUseStores => ({
  ideas: () => ({ value: [], setAside: [] }),
  videos: () => Promise.resolve({ value: [], setAside: [] }),
  subscribe: () => () => undefined,
  ...over,
})

describe("reading what uses each take", () => {
  it("reads Studio's stores as unread until they are handed in", async () => {
    expect((await createTakeUses(ports()).read()).unread).toEqual([
      "videos",
      "ideas",
    ])
    const handed = createTakeUses(ports({ studio: () => studio() }))
    expect((await handed.read()).unread).toEqual([])
  })

  it("reads a store it can't read, or one that fails, as unread, and says so", async () => {
    const failed = vi.fn<UsePorts["failed"]>()
    const uses = await createTakeUses(
      ports({
        spoken: () => null,
        interview: () => {
          throw new Error("storage")
        },
        studio: () =>
          studio({
            ideas: () => null,
            videos: () => Promise.reject(new Error("db")),
          }),
        failed,
      })
    ).read()
    expect(uses.unread).toEqual(["spoken", "videos", "ideas", "interview"])
    expect(
      failed.mock.calls.map(
        ([source]: Parameters<UsePorts["failed"]>) => source
      )
    ).toEqual(["interview", "videos"])
  })

  it("keeps only the newest read for the lists, and reads again on a Studio write", async () => {
    const resolvers: Array<(value: { value: []; setAside: [] }) => void> = []
    let write: () => void = () => undefined
    let spoken = 0
    const runtime = createTakeUses(
      ports({
        spoken: () => {
          spoken += 1
          return {
            setAside: [],
            value:
              spoken === 1
                ? []
                : [
                    {
                      id: "c1",
                      title: "T",
                      category: "introduction",
                      pastedAt: "x",
                      parts: [
                        {
                          id: null,
                          kind: "read",
                          ask: null,
                          text: "x",
                          takes: ["t1"],
                          using: "t1",
                        },
                      ],
                    },
                  ],
          }
        },
        studio: () =>
          studio({
            videos: () =>
              new Promise((resolve) => {
                resolvers.push(resolve)
              }),
            subscribe: (listener): (() => void) => {
              write = listener
              return () => undefined
            },
          }),
      })
    )
    const heard = vi.fn()
    runtime.subscribe(heard)
    write()
    expect(resolvers).toHaveLength(2)
    // The newer read lands first, then the older one: the older is dropped.
    resolvers[1]?.({ value: [], setAside: [] })
    await Promise.resolve()
    await Promise.resolve()
    resolvers[0]?.({ value: [], setAside: [] })
    await Promise.resolve()
    await Promise.resolve()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot()?.of.get("t1")).toHaveLength(1)
  })

  it("adds what home said plays a take, keeps it through a word it can't read, and drops it once home says none", async () => {
    const runtime = createTakeUses(ports())
    const video = {
      kind: "studio-video" as const,
      key: "v1",
      title: "Pager",
      at: "x",
      withdrawsOnDelete: false,
    }
    runtime.told([{ id: "t1", usedBy: [video] }])
    expect((await runtime.read()).of.get("t1")).toEqual([
      {
        kind: "home",
        video: "studio-video",
        key: "v1",
        title: "Pager",
        withdraws: false,
      },
    ])
    runtime.told([{ id: "t1", usedBy: undefined }])
    expect((await runtime.read()).of.get("t1")).toHaveLength(1)
    runtime.told([{ id: "t1", usedBy: [] }])
    expect((await runtime.read()).of.get("t1")).toBeUndefined()
  })
})

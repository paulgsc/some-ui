/**
 * @vitest-environment jsdom
 *
 * LG1 (RR6, #2237): on a desk whose audio leaves once home holds it (Rust
 * Rounds' notes), only a take home holds lets its audio go, and only once
 * a way to hear it from home is wired; its take stays listed, marked as
 * heard from home before the audio goes, so no sweep reads it as lost; a
 * mark the phone could not store lets nothing go; and a take whose audio is
 * not on this phone plays from home.
 */
import type { BlobShelf } from "@some-ui/voice-capture"
import { microphoneOwner } from "@some-ui/voice-capture"
import {
  memoryShelf,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PatternDesk } from "@/lib/takes-desk"
import { deskList, patternDesk } from "@/lib/takes-desk"
import { createPatternTakes } from "@/lib/takes-desk/pattern"
import type { Take } from "@/lib/takes-desk/runtime"

const LIMITS = { max: Number.POSITIVE_INFINITY, maxMs: 60_000 }

const take = (id: string): Take => ({
  id,
  line: `rust-rounds:indexing-01/${id}`,
  takenAt: Date.parse("2026-11-02T18:00:00.000Z"),
  durationMs: 3000,
  mimeType: "audio/webm",
})

let made = 0

/** A desk under a key of its own, holding `ids` with their audio. */
async function deskOf(
  ids: ReadonlyArray<string>,
  audioLeaves: boolean
): Promise<{ desk: PatternDesk; shelf: BlobShelf; key: string }> {
  made += 1
  const key = `audio-leaves-${String(made)}`
  const shelf = memoryShelf()
  const desk = patternDesk({
    key,
    screen: "test",
    dbName: key,
    from: "rust-round",
    limits: LIMITS,
    ...(audioLeaves ? { audioLeaves: true as const } : {}),
    shelf: {
      shelf: () => shelf,
      saving: (): void => undefined,
      isSaving: (): boolean => false,
    },
  })
  const list = deskList(key, LIMITS.max)
  for (const id of ids) {
    await shelf.put(id, new Blob([id]))
    list.add(take(id))
  }
  return { desk, shelf, key }
}

const fromHome = (): Promise<Blob | null> =>
  Promise.resolve(new Blob(["from home"]))

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("LG1 (RR6): a Rust Rounds note's audio leaves only once home holds it", () => {
  it("lets go only the audio of a take home holds, once a way back is wired, keeping the take listed", async () => {
    const { desk, shelf } = await deskOf(["a", "b"], true)
    await desk.letGo(new Set(["a"]))
    expect((await shelf.ids()).sort()).toEqual(["a", "b"])

    desk.audioFrom(fromHome)
    await desk.letGo(new Set(["a", "gone"]))
    expect(await shelf.ids()).toEqual(["b"])
    expect(desk.kept().map(({ id, onHome }) => [id, onHome ?? false])).toEqual([
      ["b", false],
      ["a", true],
    ])
  })

  it("lets audio go on a later pass when its removal failed after the mark", async () => {
    const { desk, shelf } = await deskOf(["a"], true)
    desk.audioFrom(fromHome)
    vi.spyOn(shelf, "remove").mockRejectedValueOnce(new Error("closed"))
    await expect(desk.letGo(new Set(["a"]))).rejects.toThrow("closed")
    expect(desk.kept()[0]?.onHome).toBe(true)
    await desk.letGo(new Set(["a"]))
    expect(await shelf.ids()).toEqual([])
  })

  it("lets nothing go on a desk whose audio stays", async () => {
    const { desk, shelf } = await deskOf(["a"], false)
    desk.audioFrom(fromHome)
    await desk.letGo(new Set(["a"]))
    expect(await shelf.ids()).toEqual(["a"])
    expect(desk.kept()[0]?.onHome).toBeUndefined()
  })

  it("lets nothing go when the phone could not store the mark", async () => {
    const { desk, shelf } = await deskOf(["a"], true)
    desk.audioFrom(fromHome)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full")
    })
    await desk.letGo(new Set(["a"]))
    expect(await shelf.ids()).toEqual(["a"])
  })

  it("keeps a take heard from home through the sweep, and lets one whose audio never landed go", async () => {
    const { desk, shelf } = await deskOf(["a", "b"], true)
    desk.audioFrom(fromHome)
    await desk.letGo(new Set(["a"]))
    await shelf.remove(["b"])
    desk.sweep()
    await vi.waitFor(() => {
      expect(desk.kept().map(({ id }) => id)).toEqual(["a"])
    })
  })
})

describe("a take whose audio is not on this phone plays from home (RR6)", () => {
  it("asks home for it only when the phone holds none, and plays what home gives", async () => {
    const shelf = memoryShelf()
    const here = new Blob(["here"])
    const homes = new Blob(["home's"])
    await shelf.put("here", here)
    const asked: Array<string> = []
    const played: Array<Blob> = []
    const player = simulatedPlayer()
    const phone = createPatternTakes(
      {
        screen: "test",
        startRecording: simulatedMicrophone({ now: Date.now }).startRecording,
        owner: microphoneOwner(),
        audio: shelf,
        takes: deskList("plays-from-home", LIMITS.max),
        saving: () => undefined,
        player: {
          play: (blob): ReturnType<typeof player.play> => {
            played.push(blob)
            return player.play(blob)
          },
        },
        now: Date.now,
        newId: () => "n1",
        kept: () => ({ place: "home", since: null }),
        from: "rust-round",
        back:
          () =>
          (id): Promise<Blob | null> => {
            asked.push(id)
            return Promise.resolve(id === "earlier" ? homes : null)
          },
      },
      LIMITS
    )
    phone.pattern.play("here")
    await vi.waitFor(() => {
      expect(played.length).toBe(1)
    })
    expect(played[0]).toBe(here)
    await vi.waitFor(() => {
      expect(phone.pattern.getSnapshot().playback.kind).toBe("playing")
    })
    phone.pattern.stopPlaying()
    phone.pattern.play("earlier")
    await vi.waitFor(() => {
      expect(played.length).toBe(2)
    })
    expect(played[1]).toBe(homes)
    await vi.waitFor(() => {
      expect(phone.pattern.getSnapshot().playback.kind).toBe("playing")
    })
    expect(asked).toEqual(["earlier"])
    phone.pattern.stopPlaying()
    phone.pattern.play("nowhere")
    await vi.waitFor(() => {
      expect(phone.pattern.getSnapshot().unplayable).toBe("nowhere")
    })
  })
})

describe("a note home deleted for good from My data (#2579)", () => {
  it("lets its audio go on any desk, keeping the take listed and marked first", async () => {
    const { desk, shelf } = await deskOf(["a", "b"], false)
    await desk.letGoDeleted(new Set(["a", "gone"]))
    expect(await shelf.ids()).toEqual(["b"])
    expect(desk.kept().map(({ id, onHome }) => [id, onHome ?? false])).toEqual([
      ["b", false],
      ["a", true],
    ])
  })
})

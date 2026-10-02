/**
 * @vitest-environment jsdom
 *
 * The invariant this hook owes the session record, stated once and checked
 * for every writer it has:
 *
 * > A burst of edits leaves as exactly one `PATCH`, and that `PATCH`
 * > contains every edit in the burst. Nothing the editor shows as applied
 * > is ever absent from what was sent.
 *
 * Both halves matter, and they fail in opposite directions. One request per
 * edit is the O(C) fan-out: binding C panels in a viewport cost C round
 * trips whose payloads each re-sent the whole accumulated `scenes` array,
 * so the bytes went as C². Sending *fewer* writes than were made is worse
 * and much quieter: `useIntent`'s thundering-herd guard drops a second
 * `start()` made during an in-flight one, which is right for a
 * double-clicked button and wrong for a per-panel handler, where the
 * dropped call is a different edit. `bindOverrides` still rendered it, so
 * six binds showed six panels, persisted one, and said nothing.
 *
 * `lib/intent/dropped-write.ts` is what stops that recurring anywhere else
 * in the app - it throws under vitest when a *distinct* write is discarded.
 * These tests are the other half: they pin the scheduler behaviour that
 * keeps this hook from ever putting the guard in that position, and they
 * are what goes red if it regresses to dispatching per edit.
 */

import type { JSX, ReactNode } from "react"
import type { ActiveLifetime, SceneConfig } from "@some-ui/types"
import { SceneConfigSchema } from "@some-ui/types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { SessionRecord } from "@/lib/tenant"
import { useLiveLayoutEditor } from "@/components/player/use-live-layout-editor"

const SCENE_NAME = "scene-one"
/** Comfortably past `PERSIST_DEBOUNCE_MS` (350). */
const PAST_DEBOUNCE_MS = 500

function fixtureScene(): SceneConfig {
  return {
    scene_name: SCENE_NAME,
    duration: 60_000,
    start_time: 0,
    ui: [{ panels: {} }],
  }
}

function fixtureSession(): SessionRecord {
  return {
    id: "session-coalescing-1",
    name: "Coalescing",
    status: "active",
    activities: [],
    scenes: [fixtureScene()],
    layoutMode: "basic",
    totalDurationMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const LIFETIMES: Array<ActiveLifetime> = [
  {
    id: 1,
    started_at: 0,
    kind: {
      Scene: {
        scene_id: "s1",
        scene_name: SCENE_NAME,
        duration: 60_000,
        ui: [{ panels: {} }],
      },
    },
  },
]

/**
 * `usePrimaryScene` reads the orchestrator store, which only a running
 * player populates; `onBind` returns early without it, so a test that did
 * not stub it would pass by never exercising the path at all. The hotkey is
 * stubbed for the same reason - `toggleEditMode`'s eager flush is only
 * reachable from inside edit mode.
 */
vi.mock("some-ui-utils", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePrimaryScene: (): ActiveLifetime | undefined => LIFETIMES[0],
  useEditModeHotkey: (): [boolean, () => void] => [true, (): void => undefined],
}))

/** Only the two fields these tests read; a patch may carry either or both. */
const patchSchema = z.object({
  layout: z.unknown().optional(),
  scenes: z.array(SceneConfigSchema).optional(),
})

type Patch = z.infer<typeof patchSchema>

type Recorder = {
  patches: Array<Patch>
  /** Panel ids carried by the most recent `scenes` patch sent. */
  persistedPanels: () => Array<string>
  /** Completes the request `hold` is keeping open. */
  release: () => void
}

/**
 * Records every `PATCH` body. With `hold: true` the first request stays
 * open until `release()`, which is how the "edit made during an in-flight
 * save" case is driven deterministically rather than by racing a timer.
 */
function recordPatches(options: { hold?: boolean } = {}): Recorder {
  const patches: Array<Patch> = []
  let scenes: Array<SceneConfig> = [fixtureScene()]
  let releaseHeld: (() => void) | null = null
  let held = false

  const impl: typeof fetch = async (_input, init) => {
    if ((init?.method ?? "GET") !== "PATCH") {
      return Promise.reject(new TypeError("Failed to fetch"))
    }
    const patch = patchSchema.parse(JSON.parse(String(init?.body ?? "{}")))
    patches.push(patch)
    if (patch.scenes) scenes = patch.scenes
    const body = JSON.stringify({ ...fixtureSession(), scenes })
    if (options.hold && !held) {
      held = true
      await new Promise<void>((resolve) => {
        releaseHeld = resolve
      })
    }
    return new Response(body, { status: 200 })
  }
  vi.stubGlobal("fetch", impl)

  return {
    patches,
    persistedPanels: (): Array<string> => {
      const sent = patches.flatMap((patch) => patch.scenes ?? [])
      // Nothing sent yet is a legitimate state for these tests to assert
      // on (the in-flight case checks it), so it reads as no panels rather
      // than an index into an empty array.
      if (sent.length === 0) return []
      const lastScene = sent[sent.length - 1]
      return Object.keys(lastScene.ui[0].panels ?? {}).sort()
    },
    release: (): void => {
      if (releaseHeld !== null) releaseHeld()
    },
  }
}

function mount(): { current: ReturnType<typeof useLiveLayoutEditor> } {
  const session = fixtureSession()
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useLiveLayoutEditor(session, LIFETIMES, { editable: true }),
    { wrapper }
  )
  return result
}

async function settle(ms: number = PAST_DEBOUNCE_MS): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("live layout editor: a burst leaves as one write", () => {
  it("binding C panels in one burst issues exactly one PATCH carrying all C", async () => {
    const recorder = recordPatches()
    const result = mount()

    const C = 6
    act(() => {
      for (let index = 0; index < C; index++) {
        result.current.onBind(`leaf-${index}`, `key-${index}`)
      }
    })
    await settle()

    // The fan-out half: one request, not C.
    expect(recorder.patches).toHaveLength(1)
    // The silent-loss half: that one request carries every bind.
    expect(recorder.persistedPanels()).toEqual([
      "leaf-0",
      "leaf-1",
      "leaf-2",
      "leaf-3",
      "leaf-4",
      "leaf-5",
    ])
  })

  it("shows nothing as bound that was not sent", async () => {
    const recorder = recordPatches()
    const result = mount()

    act(() => {
      for (let index = 0; index < 4; index++) {
        result.current.onBind(`leaf-${index}`, `key-${index}`)
      }
    })
    await settle()

    // `boundLeafIds` is what the viewport renders as bound. Before the
    // scheduler existed this read four while one panel had been persisted,
    // and nothing in the UI distinguished the two.
    const shown = [...result.current.boundLeafIds].sort()
    expect(recorder.persistedPanels()).toEqual(shown)
  })

  it("coalesces a resize and a bind in the same burst into one PATCH", async () => {
    const recorder = recordPatches()
    const result = mount()

    act(() => {
      result.current.onLeafResize("leaf-0", "right", 40, 800)
      result.current.onBind("leaf-1", "hangul")
    })
    await settle()

    expect(recorder.patches).toHaveLength(1)
    // Both writers' edits survive the merge - neither overwrites the other,
    // which is why the scheduler accumulates a patch rather than a tree.
    expect(recorder.patches[0]?.layout).toBeDefined()
    expect(recorder.persistedPanels()).toEqual(["leaf-1"])
  })

  it("does not lose a bind made while an earlier save is in flight", async () => {
    const recorder = recordPatches({ hold: true })
    const result = mount()

    act(() => {
      result.current.onBind("leaf-0", "hangul")
    })
    await settle()
    expect(recorder.patches).toHaveLength(1)

    // This bind lands while the first request is still open. `useIntent`'s
    // guard would have discarded it outright; the scheduler holds it, and
    // `sentScenesRef` is what stops it rebuilding the array from a
    // `session` prop that predates the first bind.
    act(() => {
      result.current.onBind("leaf-1", "topik")
    })
    await settle()
    expect(recorder.patches).toHaveLength(1)

    await act(async () => {
      recorder.release()
      await new Promise((resolve) => setTimeout(resolve, PAST_DEBOUNCE_MS))
    })

    expect(recorder.patches).toHaveLength(2)
    expect(recorder.persistedPanels()).toEqual(["leaf-0", "leaf-1"])
  })
})

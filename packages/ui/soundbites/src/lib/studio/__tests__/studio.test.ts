/** @vitest-environment node */
import type {
  Playback,
  Recording,
  StartRecording,
  Take,
} from "@some-ui/voice-capture"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import type { Project } from "@soundbites/lib/project/model"
import { latest, primerAt } from "@soundbites/lib/project/model"
import { TAIL_MS } from "@soundbites/lib/project/script"
import { projectOf } from "@soundbites/lib/studio/machine"
import type { StudioRuntime } from "@soundbites/lib/studio/runtime"
import { createStudio } from "@soundbites/lib/studio/runtime"
import { othersOnPhone } from "@soundbites/lib/studio/view"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { describe, expect, it, vi } from "vitest"

import { memoryProjectStore, PRIMER_TEXT } from "./fixture"

/** A microphone that hears `durationMs` of speech per take. */
function fakeMic(durationMs = 4_000, bytes = 5): StartRecording {
  return (): Promise<Recording> =>
    Promise.resolve({
      level: (): number => 0.3,
      finish: (): Promise<Take> =>
        Promise.resolve({
          blob: new Blob(["v".repeat(bytes)], { type: "audio/webm" }),
          mimeType: "audio/webm;codecs=opus",
          durationMs,
        }),
      discard: (): void => undefined,
    })
}

const NOW = Date.UTC(2026, 9, 30, 10)

type Running = StudioRuntime & { readonly detach: () => void }

/** A runtime on `memory`, attached; its takes' ids are `prefix` and a count. */
function studio(
  memory: ReturnType<typeof memoryProjectStore>,
  mic: StartRecording = fakeMic(),
  prefix = "t"
): Running {
  let tick = 0
  let ids = 0
  const runtime = createStudio({
    store: memory.store,
    startRecording: mic,
    // Each reading of the clock a second on, so takes are in order.
    now: () => NOW + 1_000 * tick++,
    newId: () => `${prefix}${++ids}`,
    readText: (file) => file.text(),
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
    player: {
      play: (): Playback => ({
        ended: new Promise(() => undefined),
        stop: vi.fn(),
      }),
    },
  })
  const detach = runtime.attach()
  return { ...runtime, detach }
}

/** Waits until `ready` holds of the runtime's state. */
async function until(
  runtime: StudioRuntime,
  ready: (state: ReturnType<StudioRuntime["getSnapshot"]>) => boolean
): Promise<void> {
  await vi.waitFor(() => expect(ready(runtime.getSnapshot())).toBe(true))
}

function projectIn(runtime: StudioRuntime): Project {
  const project = projectOf(runtime.getSnapshot())
  if (project === null) throw new Error("no project")
  return project
}

const settledWrites = (
  state: ReturnType<StudioRuntime["getSnapshot"]>
): boolean =>
  state.inFlight === null && state.queue.length === 0 && state.closing === null

async function opened(memory = memoryProjectStore()): Promise<Running> {
  const runtime = studio(memory)
  await until(runtime, (state) => state.shelf.kind === "read")
  runtime.dispatch({
    type: "primerPicked",
    file: new Blob([PRIMER_TEXT], { type: "application/json" }),
  })
  await until(
    runtime,
    (state) => projectOf(state) !== null && settledWrites(state)
  )
  return runtime
}

async function recordOne(runtime: StudioRuntime): Promise<void> {
  runtime.dispatch({ type: "recordPressed" })
  await until(runtime, (state) => state.activity.kind === "recording")
  runtime.dispatch({ type: "recordPressed" })
  await until(
    runtime,
    (state) => state.activity.kind === "idle" && settledWrites(state)
  )
}

describe("a primer opened in Studio", () => {
  it("becomes a project whose scenes are the primer's cuts", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const project = projectIn(runtime)
    expect(memory.projects.get(project.id)).toEqual(project)
    const first = latest(project)
    expect(first.author).toBe("claude")
    expect(
      first.cutList.shots.map((shot) => [shot.id, shot.durationMs])
    ).toEqual([
      ["path", 20_000],
      ["miss", 15_000],
      ["next", 10_000],
    ])
    expect(primerAt(project, first.rev)?.title).toBe("Playoff Delta, week 8")
    // The project file reads back as written, primer and all.
    expect(readProjectFile(projectFile(project))).toEqual({
      ok: true,
      value: project,
    })
    expect(runtime.getSnapshot().notice).toBe(
      STUDIO_WORDS.start.opened("Playoff Delta, week 8")
    )
  })

  it("over a video already open, asks; the next version keeps every take", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "notYetPressed" })
    await until(runtime, settledWrites)
    runtime.dispatch({
      type: "primerPicked",
      file: new Blob([PRIMER_TEXT.replace("The one miss", "The miss, again")]),
    })
    await until(runtime, (state) => state.choosing !== null)
    runtime.dispatch({ type: "versionChosen", as: "next" })
    await until(runtime, () => latest(projectIn(runtime)).rev === 3)
    const project = projectIn(runtime)
    expect(project.revisions).toHaveLength(3)
    expect(project.takes).toHaveLength(1)
    // Scene "path" kept its fit to its take through the new primer.
    expect(latest(project).cutList.shots[0]?.take?.outMs).toBe(4_000)
    expect(primerAt(project, 3)?.cuts[1]?.point).toBe("The miss, again")
  })
})

describe("recording a scene", () => {
  it("keeps the take and writes the scene's length as the take and a breath", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    const project = projectIn(runtime)
    expect(project.takes).toMatchObject([
      { id: "t1", shot: "path", durationMs: 4_000, onPhone: true },
    ])
    expect(project.chosen).toEqual({ path: "t1" })
    const revision = latest(project)
    expect(revision.author).toBe("owner")
    const scene = revision.cutList.shots[0]!
    expect(scene.durationMs).toBe(200 + 4_000 + TAIL_MS)
    expect(scene.take).toEqual({
      file: "path-t1.webm",
      inMs: 0,
      outMs: 4_000,
    })
    expect(memory.audio.has(`${project.id}:t1`)).toBe(true)
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.kept(4_000))
    // The project file still reads, at every revision.
    expect(readProjectFile(projectFile(project)).ok).toBe(true)
  })

  it("again keeps both takes and chooses the newer", async () => {
    const runtime = await opened()
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    await recordOne(runtime)
    const project = projectIn(runtime)
    expect(project.takes.map((take) => take.id)).toEqual(["t1", "t2"])
    expect(project.chosen).toEqual({ path: "t2" })
  })

  it("on a full phone keeps nothing, reads the store again and says what to do", async () => {
    const memory = memoryProjectStore([], 3)
    const runtime = studio(memory, fakeMic(4_000, 50))
    await until(runtime, (state) => state.shelf.kind === "read")
    runtime.dispatch({ type: "primerPicked", file: new Blob([PRIMER_TEXT]) })
    await until(
      runtime,
      (state) => projectOf(state) !== null && settledWrites(state)
    )
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    const before = projectIn(runtime)
    await recordOne(runtime)
    const after = projectIn(runtime)
    expect(after).toEqual(before)
    expect(after.takes).toEqual([])
    expect(memory.projects.get(after.id)).toEqual(before)
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.full)
    // The read that followed came back as the store holds it.
    expect(runtime.getSnapshot().readSeq).toBeGreaterThan(1)
  })
})

describe("a sitting", () => {
  it("stopped after any take resumes on the same scene", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    await recordOne(first)
    first.dispatch({ type: "keepNextPressed" })
    await recordOne(first)
    // Stopped on scene 2, right after its take.
    first.dispatch({ type: "doneForNowPressed" })
    await until(first, (state) => state.closed === "saved")
    const sitting = projectIn(first).sittings.at(-1)
    expect(sitting).toMatchObject({
      shot: "miss",
      done: STUDIO_WORDS.sittingDone([1, 2]),
      next: STUDIO_WORDS.sittingNext({ n: 3, artifact: "End card" }),
    })
    expect(sitting?.closedAt).not.toBeNull()

    // A new page: the same store, a new runtime.
    const second = studio(memory)
    await until(second, (state) => state.shelf.kind === "read")
    second.dispatch({ type: "recordChosen" })
    expect(second.getSnapshot().screen).toEqual({
      kind: "record",
      shot: "miss",
    })
  })

  it("left without Done for now resumes on the last take's scene", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    await recordOne(first)
    first.dispatch({ type: "keepNextPressed" })
    await recordOne(first)

    const second = studio(memory)
    await until(second, (state) => state.shelf.kind === "read")
    second.dispatch({ type: "recordChosen" })
    expect(second.getSnapshot().screen).toEqual({
      kind: "record",
      shot: "miss",
    })
    await until(second, settledWrites)
    // The sitting left open goes on; no second one opens over it.
    expect(projectIn(second).sittings).toHaveLength(1)
  })

  it("done for now mid-take keeps the take, then closes counting it", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    runtime.dispatch({ type: "doneForNowPressed" })
    await until(runtime, (state) => state.closed === "saved")
    const project = projectIn(runtime)
    expect(project.takes).toHaveLength(1)
    expect(project.sittings.at(-1)).toMatchObject({
      shot: "path",
      done: STUDIO_WORDS.sittingDone([1]),
    })
    expect(memory.projects.get(project.id)).toEqual(project)
  })

  it("asks how it went, and what got in the way only when not smooth", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "wentChosen", went: "rough" })
    expect(runtime.getSnapshot().screen).toMatchObject({ step: "what" })
    runtime.dispatch({ type: "snagTold", text: "  The microphone  " })
    expect(runtime.getSnapshot().screen).toMatchObject({ step: "saved" })
    await vi.waitFor(() => expect(memory.friction).toHaveLength(1))
    expect(memory.friction[0]).toMatchObject({
      sitting: "s1",
      went: "rough",
      gotInTheWay: "The microphone",
    })
  })
})

describe("takes that arrived", () => {
  it("are kept by Drive and leave the phone, their record staying", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    const { id } = projectIn(runtime)
    runtime.dispatch({ type: "takesArrived", project: id, takes: ["t1"] })
    await until(runtime, (state) => state.notice.includes("left the phone"))
    expect(projectIn(runtime).takes[0]).toMatchObject({
      keptBy: ["drive"],
      onPhone: false,
    })
    expect(memory.audio.has(`${id}:t1`)).toBe(false)
  })
})

describe("the Journal tab's episode", () => {
  it("is carried into Studio the first time it opens, and said so", async () => {
    const memory = memoryProjectStore()
    const carrying = await opened(memoryProjectStore())
    memory.journal.carried = {
      kind: "carried",
      project: projectIn(carrying),
      left: 0,
    }
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(
      STUDIO_WORDS.notice.carried("Playoff Delta, week 8", 0)
    )
    expect(projectIn(runtime).id).toBe(projectIn(carrying).id)
  })
})

/** A new page on `memory`, opened on Record: the scene it resumes on. */
async function resumedOn(
  memory: ReturnType<typeof memoryProjectStore>
): Promise<unknown> {
  const next = studio(memory, fakeMic(), "u")
  await until(next, (state) => projectOf(state) !== null)
  next.dispatch({ type: "recordChosen" })
  return next.getSnapshot().screen
}

describe("a sitting stopped after any take resumes on the same scene", () => {
  it("after the first scene's take", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    await recordOne(first)
    first.dispatch({ type: "doneForNowPressed" })
    await until(first, (state) => state.closed === "saved")
    expect(await resumedOn(memory)).toEqual({ kind: "record", shot: "path" })
  })

  it("after the last scene's take, kept with that's every scene", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    for (const _ of ["path", "miss", "next"]) {
      await recordOne(first)
      first.dispatch({ type: "keepNextPressed" })
    }
    await until(first, (state) => state.closed === "saved")
    expect(projectIn(first).sittings.at(-1)).toMatchObject({
      shot: "next",
      next: STUDIO_WORDS.sittingNext(null),
    })
    expect(await resumedOn(memory)).toEqual({ kind: "record", shot: "next" })
  })

  it("when the page is hidden mid-take: the take is kept", async () => {
    const memory = memoryProjectStore()
    let hide: (hidden: boolean) => void = () => undefined
    const runtime = createStudio({
      store: memory.store,
      startRecording: fakeMic(),
      now: () => NOW,
      newId: () => "t1",
      readText: (file) => file.text(),
      onVisibility: (listener) => {
        hide = listener
        listener(false)
        return (): void => undefined
      },
      player: {
        play: (): Playback => ({
          ended: new Promise(() => undefined),
          stop: vi.fn(),
        }),
      },
    })
    runtime.attach()
    await until(runtime, (state) => state.shelf.kind === "read")
    runtime.dispatch({ type: "primerPicked", file: new Blob([PRIMER_TEXT]) })
    await until(
      runtime,
      (state) => projectOf(state) !== null && settledWrites(state)
    )
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "keepNextPressed" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    hide(true)
    await until(
      runtime,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    expect(projectIn(runtime).takes.map((take) => take.shot)).toEqual(["miss"])
    expect(await resumedOn(memory)).toEqual({ kind: "record", shot: "miss" })
  })

  it("when the screen goes away mid-take: the take is kept after it", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    first.dispatch({ type: "keepNextPressed" })
    first.dispatch({ type: "keepNextPressed" })
    first.dispatch({ type: "recordPressed" })
    await until(first, (state) => state.activity.kind === "recording")
    first.detach()
    await until(
      first,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    const [kept] = [...memory.projects.values()]
    expect(kept?.takes.map((take) => take.shot)).toEqual(["next"])
    expect(await resumedOn(memory)).toEqual({ kind: "record", shot: "next" })
  })
})

describe("two screens at once", () => {
  it("each sees the other's takes, and neither's is lost", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    const second = studio(memory, fakeMic(), "u")
    await until(second, (state) => projectOf(state) !== null)
    first.dispatch({ type: "recordChosen" })
    await until(first, settledWrites)
    await until(second, settledWrites)
    second.dispatch({ type: "recordChosen" })
    await recordOne(first)
    // The second screen read the first's take as it landed.
    await until(second, () => projectIn(second).takes.length === 1)
    await recordOne(second)
    const [kept] = [...memory.projects.values()]
    expect(kept?.takes.map((take) => take.id)).toEqual(["t1", "u1"])
    expect(memory.audio.size).toBe(2)
  })

  it("a take refused because the project moved on goes again on it", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    // Another screen writes the project between this take's start and its keep.
    const keep = memory.store.keepTake
    let raced = false
    memory.store.keepTake = (project, take, audio): Promise<void> => {
      if (!raced) {
        raced = true
        const kept = memory.projects.get(project.id)!
        memory.projects.set(project.id, {
          ...kept,
          sittings: [...kept.sittings, { ...kept.sittings.at(-1)!, id: "s9" }],
        })
      }
      return keep(project, take, audio)
    }
    await recordOne(runtime)
    expect(projectIn(runtime).takes.map((take) => take.id)).toEqual(["t1"])
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.kept(4_000))
  })
})

describe("every video with takes on the phone", () => {
  it("is listed on Start and can be opened, so its takes can be let go", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "notYetPressed" })
    await until(runtime, settledWrites)
    const older = projectIn(runtime).id
    runtime.dispatch({
      type: "primerPicked",
      file: new Blob([PRIMER_TEXT.replace("Playoff Delta, week 8", "Week 9")]),
    })
    await until(runtime, (state) => state.choosing !== null)
    runtime.dispatch({ type: "versionChosen", as: "new" })
    await until(runtime, () => projectIn(runtime).id !== older)
    const state = runtime.getSnapshot()
    expect(
      othersOnPhone(
        state.shelf.kind === "read" ? state.shelf.projects : [],
        state.current
      )
    ).toEqual([{ id: older, title: "Playoff Delta, week 8", onPhone: 1 }])
    runtime.dispatch({ type: "projectOpened", project: older })
    expect(projectIn(runtime).id).toBe(older)
    runtime.dispatch({ type: "takesArrived", project: older, takes: ["t1"] })
    await until(runtime, (s) => s.notice === STUDIO_WORDS.notice.arrived(1))
    expect(memory.audio.size).toBe(0)
  })
})

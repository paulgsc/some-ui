/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { ShotTime } from "@some-ui/video-render"
import { REVIEW_SCHEMA } from "@some-ui/video-render"
import type {
  Playback,
  StartRecording,
  Take,
  TakeDeadlines,
} from "@some-ui/voice-capture"
import { fakeMic } from "@soundbites/lib/fake-mic"
import type { Listened } from "@soundbites/lib/idea/machine"
import type { IdeaListener, Listening } from "@soundbites/lib/idea/runtime"
import { run, started, take } from "@soundbites/lib/project/__tests__/fixture"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { finishOf } from "@soundbites/lib/project/finish"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { CutListShape, Project } from "@soundbites/lib/project/model"
import { latest, newProject, primerAt } from "@soundbites/lib/project/model"
import { cutListOf, TAIL_MS } from "@soundbites/lib/project/script"
import type { Speaking } from "@soundbites/lib/studio/machine"
import {
  initialStudioState,
  projectOf,
  step,
} from "@soundbites/lib/studio/machine"
import type { StudioRuntime } from "@soundbites/lib/studio/runtime"
import { createStudio } from "@soundbites/lib/studio/runtime"
import { keptTimeLog } from "@soundbites/lib/studio/time-store"
import { othersOnPhone } from "@soundbites/lib/studio/view"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { describe, expect, it, vi } from "vitest"

import { AT, primer, PRIMER_TEXT } from "./fixture"

const NOW = Date.UTC(2026, 9, 30, 10)

type Running = StudioRuntime & { readonly detach: () => void }

/** A runtime on `memory`, attached; its takes' ids are `prefix` and a count. */
function studio(
  memory: ReturnType<typeof memoryProjectStore>,
  mic: StartRecording = fakeMic(),
  prefix = "t",
  takeDeadlines?: TakeDeadlines,
  listener?: IdeaListener
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
    takeDeadlines,
    ...(listener === undefined ? {} : { listener }),
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

function projectsOfState(
  state: ReturnType<StudioRuntime["getSnapshot"]>
): ReadonlyArray<Project> {
  return state.shelf.kind === "read" ? state.shelf.projects : []
}

const settledWrites = (
  state: ReturnType<StudioRuntime["getSnapshot"]>
): boolean =>
  state.inFlight === null && state.queue.length === 0 && state.held.length === 0

async function opened(
  memory = memoryProjectStore(),
  mic: StartRecording = fakeMic(),
  takeDeadlines?: TakeDeadlines,
  listener?: IdeaListener
): Promise<Running> {
  const runtime = studio(memory, mic, "t", takeDeadlines, listener)
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

  it("with no room left for a take, doesn't start one, and says what to do", async () => {
    const memory = memoryProjectStore([], 3)
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    runtime.dispatch({ type: "recordPressed" })
    expect(runtime.getSnapshot().activity.kind).toBe("idle")
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.noRoom)
  })

  it("refused for room as it is kept keeps nothing of it, and says what to do", async () => {
    // Room for ten seconds as read, but this take came out larger.
    const memory = memoryProjectStore([], 40_000)
    const runtime = studio(memory, fakeMic(4_000, 50_000))
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
    expect(projectIn(runtime)).toEqual(before)
    expect(memory.projects.get(before.id)).toEqual(before)
    expect(memory.audio.size).toBe(0)
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.full)
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
      shot: "path",
      went: "rough",
      gotInTheWay: "The microphone",
    })
  })
})

describe("takes that arrived in Drive", () => {
  it("are marked as kept by Drive too, and stay on the phone until home holds them (LG1)", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    const { id } = projectIn(runtime)
    runtime.dispatch({ type: "takesArrived", project: id, takes: ["t1"] })
    await until(runtime, (s) => s.notice === STUDIO_WORDS.notice.arrived(1))
    expect(projectIn(runtime).takes[0]).toMatchObject({
      keptBy: ["drive"],
      onPhone: true,
    })
    expect(memory.audio.has(`${id}:t1`)).toBe(true)
  })
})

describe("what Claude sent that doesn't read as scenes", () => {
  it("is refused in Start's words, never the reader's (SW1)", async () => {
    const runtime = await opened(memoryProjectStore())
    runtime.dispatch({
      type: "primerPicked",
      file: new Blob(['{"version":9,"title":"x","cuts":[]}']),
    })
    await until(runtime, (state) => state.primerProblem !== null)
    expect(runtime.getSnapshot().primerProblem).toBe(
      STUDIO_WORDS.start.sentProblem
    )
  })

  it.each([
    [
      "Claude's reply about an idea",
      '{"schema":"some-ui.studio-idea-reply/1","idea":"idea-1","ask":["?"]}',
    ],
    [
      "scenes naming an idea, citing its answers",
      PRIMER_TEXT.replace(/^\{/, '{"idea":"idea-1",'),
    ],
  ])(
    "points %s to the idea it belongs to, starting nothing (ST19)",
    async (_, text) => {
      const memory = memoryProjectStore()
      const runtime = studio(memory)
      await until(runtime, (state) => state.shelf.kind === "read")
      runtime.dispatch({ type: "primerPicked", file: new Blob([text]) })
      await until(runtime, (state) => state.primerProblem !== null)
      expect(runtime.getSnapshot().primerProblem).toBe(
        STUDIO_WORDS.start.ideaReply
      )
      expect(memory.projects.size).toBe(0)
    }
  )
})

describe("which video Studio opens on", () => {
  it("is the one asked for when it is on the phone, else the one touched last (ST19)", () => {
    const made = (id: string, at: string): Project =>
      newProject(id, {
        author: "claude",
        message: "Primer",
        at,
        cutList: cutListOf(primer()),
        primer: primer(),
      }).project
    const projects = [
      made("older", AT),
      made("newer", "2026-10-31T09:00:00.000Z"),
    ]
    const opensOn = (open?: string): string | null =>
      step(initialStudioState(open), {
        type: "listed",
        seq: 0,
        projects,
        notices: [],
        roomBytes: 0,
      }).state.current
    expect(opensOn("older")).toBe("older")
    expect(opensOn()).toBe("newer")
    expect(opensOn("gone")).toBe("newer")
  })
})

describe("the Journal tab's episode", () => {
  it("is carried into Studio the first time it opens, and said so", async () => {
    const memory = memoryProjectStore()
    const carrying = await opened(memoryProjectStore())
    memory.journal.carried = {
      kind: "carried",
      project: projectIn(carrying),
      cleared: 0,
      gone: 0,
    }
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(
      STUDIO_WORDS.notice.carried("Playoff Delta, week 8", 0, 0)
    )
    expect(projectIn(runtime).id).toBe(projectIn(carrying).id)
  })

  it("lets go of an episode it can't read, and says so", async () => {
    const memory = memoryProjectStore()
    memory.journal.carried = { kind: "unread", cleared: 4 }
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.carryUnread)
  })

  it("leaves an episode it can't move as it was, and says so", async () => {
    const memory = memoryProjectStore()
    memory.journal.carried = { kind: "stays", bytes: 820_000 }
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(
      STUDIO_WORDS.notice.carryStays(820_000)
    )
  })

  it("says what it let go of an earlier carry's pieces", async () => {
    const memory = memoryProjectStore()
    memory.journal.carried = { kind: "nothing", cleared: 2 }
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.cleared(2))
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

  it("another screen writes, then Done for now while a take is kept: the take is kept", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const other = studio(memory, fakeMic(), "u")
    await until(other, (state) => projectOf(state) !== null)
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    // Hold the next write while the other screen writes the same video.
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    memory.gate.hold = (): Promise<void> => held
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.inFlight?.kind === "keep")
    memory.gate.hold = null
    other.dispatch({ type: "recordChosen" })
    await until(other, settledWrites)
    // Done for now while the take is still being kept: its close queues.
    runtime.dispatch({ type: "doneForNowPressed" })
    release()
    await until(runtime, (state) => state.closed === "saved")
    const [kept] = [...memory.projects.values()]
    expect(kept?.takes.map((take) => take.id)).toEqual(["t1"])
    expect(memory.audio.size).toBe(1)
    expect(kept?.sittings.at(-1)).toMatchObject({
      shot: "path",
      done: STUDIO_WORDS.sittingDone([1]),
    })
    expect(kept?.sittings.at(-1)?.closedAt).not.toBeNull()
  })

  it("a change from another screen while a write is pending is read after it", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const other = studio(memory, fakeMic(), "u")
    await until(other, (state) => projectOf(state) !== null)
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    memory.gate.hold = (): Promise<void> => held
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, (state) => state.inFlight?.kind === "open")
    memory.gate.hold = null
    // The other screen opens a new video while this screen's write waits.
    other.dispatch({
      type: "primerPicked",
      file: new Blob([PRIMER_TEXT.replace("Playoff Delta, week 8", "Week 9")]),
    })
    await until(other, (state) => state.choosing !== null)
    other.dispatch({ type: "versionChosen", as: "new" })
    await until(other, (state) => projectsOfState(state).length === 2)
    expect(runtime.getSnapshot().stale).toBe(true)
    release()
    await until(runtime, (state) => projectsOfState(state).length === 2)
    expect(runtime.getSnapshot().stale).toBe(false)
  })

  it("a take refused after the screen went away is said by the next Start", async () => {
    const memory = memoryProjectStore()
    const first = await opened(memory)
    first.dispatch({ type: "recordChosen" })
    await until(first, settledWrites)
    first.dispatch({ type: "recordPressed" })
    await until(first, (state) => state.activity.kind === "recording")
    memory.gate.hold = (): Promise<void> => Promise.reject(new Error("disk"))
    first.detach()
    await until(first, (state) => state.activity.kind === "idle")
    memory.gate.hold = null
    expect([...memory.notices.values()]).toEqual([STUDIO_WORDS.notice.notKept])
    const next = studio(memory, fakeMic(), "u")
    await until(next, (state) => state.shelf.kind === "read")
    expect(next.getSnapshot().notice).toBe(STUDIO_WORDS.notice.notKept)
    await vi.waitFor(() => expect(memory.notices.size).toBe(0))
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
    expect(memory.audio.size).toBe(1)
  })
})

describe("writes don't wait on reads", () => {
  it("a read that fails mid-take leaves Record on screen, and the take is kept", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    // Every read fails from here on; another screen writes another video.
    memory.store.room = (): Promise<number> =>
      Promise.reject(new Error("unreadable"))
    await memory.store.update(
      "other",
      () =>
        newProject("other", {
          author: "claude",
          message: "Primer",
          at: AT,
          cutList: cutListOf(primer()),
          primer: primer(),
        }).project
    )
    await until(runtime, (state) => state.notice === STUDIO_WORDS.notice.behind)
    expect(runtime.getSnapshot().shelf.kind).toBe("read")
    expect(runtime.getSnapshot().screen).toMatchObject({ kind: "record" })
    runtime.dispatch({ type: "recordPressed" })
    await until(
      runtime,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    const kept = [...memory.projects.values()].find(
      (each) => each.id !== "other"
    )
    expect(kept?.takes.map((take) => take.id)).toEqual(["t1"])
    expect(memory.audio.size).toBe(1)
  })
})

describe("a notice kept for the next Start", () => {
  it("survives a read that fails, and is let go once shown", async () => {
    const memory = memoryProjectStore()
    await memory.store.remember(STUDIO_WORDS.notice.notKept)
    const room = memory.store.room
    memory.store.room = (): Promise<number> =>
      Promise.reject(new Error("unreadable"))
    const runtime = studio(memory)
    await until(runtime, (state) => state.shelf.kind === "unreadable")
    expect(memory.notices.size).toBe(1)
    memory.store.room = room
    runtime.dispatch({ type: "retryRead" })
    await until(runtime, (state) => state.shelf.kind === "read")
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.notKept)
    await vi.waitFor(() => expect(memory.notices.size).toBe(0))
  })
})

describe("how a sitting went", () => {
  it("is filed against the sitting the store closed, when Done comes before the sitting opens", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    memory.gate.hold = (): Promise<void> => held
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, (state) => state.inFlight?.kind === "open")
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "wentChosen", went: "smooth" })
    expect(runtime.getSnapshot().screen).toMatchObject({ step: "saved" })
    // The answer waits for the sitting the store will close.
    expect(runtime.getSnapshot().filings).toMatchObject([
      { sitting: null, answer: { went: "smooth" } },
    ])
    memory.gate.hold = null
    release()
    await until(runtime, (state) => state.closed === "saved")
    await vi.waitFor(() => expect(memory.friction).toHaveLength(1))
    expect(memory.friction[0]).toMatchObject({ sitting: "s1", went: "smooth" })
    const [kept] = [...memory.projects.values()]
    expect(kept?.sittings.map((each) => each.id)).toEqual(["s1"])
  })
})

describe("what the screen says reached Drive", () => {
  it("counts only takes newly marked as in Drive", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    runtime.dispatch({ type: "recordChosen" })
    await recordOne(runtime)
    const { id } = projectIn(runtime)
    runtime.dispatch({
      type: "takesArrived",
      project: id,
      takes: ["t1", "no-such-take"],
    })
    await until(runtime, (s) => s.notice === STUDIO_WORDS.notice.arrived(1))
  })

  it("a refused take's notice stays when the sitting closes after it", async () => {
    const memory = memoryProjectStore([], 40_000)
    const runtime = studio(memory, fakeMic(4_000, 50_000))
    await until(runtime, (state) => state.shelf.kind === "read")
    runtime.dispatch({ type: "primerPicked", file: new Blob([PRIMER_TEXT]) })
    await until(
      runtime,
      (state) => projectOf(state) !== null && settledWrites(state)
    )
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    runtime.dispatch({ type: "doneForNowPressed" })
    await until(runtime, (state) => state.closed !== "saving")
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.notice.full)
  })
})

/** A gate the next writes wait on, opened (or refused) by the test. */
function holdWrites(memory: ReturnType<typeof memoryProjectStore>): {
  readonly open: () => void
  readonly refuse: () => void
} {
  let open: () => void = () => undefined
  let refuse: () => void = () => undefined
  const held = new Promise<void>((resolve, reject) => {
    open = resolve
    refuse = (): void => reject(new Error("disk"))
  })
  // A refused gate refuses every write behind it, once.
  held.catch(() => undefined)
  memory.gate.hold = (): Promise<void> => held
  return {
    open: (): void => {
      memory.gate.hold = null
      open()
    },
    refuse: (): void => {
      memory.gate.hold = null
      refuse()
    },
  }
}

/** Opened on Record with one take kept, then Done for now with its close held. */
async function doneHeld(
  memory: ReturnType<typeof memoryProjectStore>
): Promise<{
  readonly runtime: Running
  readonly gate: ReturnType<typeof holdWrites>
}> {
  const runtime = await opened(memory)
  runtime.dispatch({ type: "recordChosen" })
  await recordOne(runtime)
  const gate = holdWrites(memory)
  runtime.dispatch({ type: "doneForNowPressed" })
  await until(runtime, (state) => state.inFlight?.kind === "close")
  return { runtime, gate }
}

describe("an answer waiting on its sitting's close", () => {
  it("is filed when the close lands, after Not yet left the Done screen", async () => {
    const memory = memoryProjectStore()
    const { runtime, gate } = await doneHeld(memory)
    runtime.dispatch({ type: "wentChosen", went: "smooth" })
    runtime.dispatch({ type: "notYetPressed" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "start" })
    gate.open()
    await vi.waitFor(() => expect(memory.friction).toHaveLength(1))
    expect(memory.friction[0]).toMatchObject({ sitting: "s1", went: "smooth" })
    expect(runtime.getSnapshot().filings).toEqual([])
  })

  it("is filed when the close lands, after the screen went away", async () => {
    const memory = memoryProjectStore()
    const { runtime, gate } = await doneHeld(memory)
    runtime.dispatch({ type: "wentChosen", went: "rough" })
    runtime.dispatch({ type: "snagTold", text: "The microphone" })
    runtime.detach()
    gate.open()
    await vi.waitFor(() => expect(memory.friction).toHaveLength(1))
    expect(memory.friction[0]).toMatchObject({
      sitting: "s1",
      gotInTheWay: "The microphone",
    })
  })

  it("whose close is refused after the screen went away is said by the next Start", async () => {
    const memory = memoryProjectStore()
    const { runtime, gate } = await doneHeld(memory)
    runtime.dispatch({ type: "wentChosen", went: "smooth" })
    runtime.detach()
    gate.refuse()
    await vi.waitFor(() =>
      expect([...memory.notices.values()]).toEqual([
        STUDIO_WORDS.done.notSaved,
        STUDIO_WORDS.done.answerNotKept,
      ])
    )
    expect(memory.friction).toEqual([])
  })
})

describe("Done for now twice while a take is still saving", () => {
  it("records both sittings and files both answers", async () => {
    let finish: () => void = () => undefined
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const held: StartRecording = async () => {
      const recording = await fakeMic()()
      return {
        ...recording,
        finish: async (): Promise<Take> => {
          await finished
          return recording.finish()
        },
      }
    }
    const memory = memoryProjectStore()
    const runtime = await opened(memory, held)
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "saving")
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "wentChosen", went: "smooth" })
    runtime.dispatch({ type: "notYetPressed" })
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "wentChosen", went: "rough" })
    runtime.dispatch({ type: "snagTold", text: "Twice" })
    // The second sitting's open waits behind the first close, not ahead of it.
    expect(runtime.getSnapshot().held.map((each) => each.kind)).toEqual([
      "close",
      "open",
      "close",
    ])
    finish()
    await until(
      runtime,
      (state) => settledWrites(state) && state.filings.length === 0
    )
    expect(memory.friction.map((f) => [f.sitting, f.went])).toEqual([
      ["s1", "smooth"],
      ["s2", "rough"],
    ])
    const { sittings, takes } = projectIn(runtime)
    expect(sittings).toHaveLength(2)
    expect(takes).toHaveLength(1)
  })
})

describe("an answer whose report fails after the screen went away", () => {
  it("is said by the next Start", async () => {
    const memory = memoryProjectStore()
    const { runtime, gate } = await doneHeld(memory)
    // An answer already filed for this sitting makes the store refuse the report.
    memory.friction.push({
      project: projectIn(runtime).id,
      sitting: "s1",
      shot: "path",
      at: AT,
      went: "rough",
      gotInTheWay: null,
    })
    runtime.dispatch({ type: "wentChosen", went: "smooth" })
    runtime.detach()
    gate.open()
    await vi.waitFor(() =>
      expect([...memory.notices.values()]).toContain(
        STUDIO_WORDS.done.answerNotKept
      )
    )
  })
})

describe("a close refused after Not yet", () => {
  it("is said on the screen that is up", async () => {
    const memory = memoryProjectStore()
    const { runtime, gate } = await doneHeld(memory)
    runtime.dispatch({ type: "notYetPressed" })
    gate.refuse()
    await until(runtime, (state) => state.notice === STUDIO_WORDS.done.notSaved)
    expect(runtime.getSnapshot().screen).toEqual({ kind: "start" })
  })
})

describe("a screen that has gone", () => {
  it("lets go of no notice the store keeps for the next Start", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const other = studio(memory, fakeMic(), "u")
    await until(other, (state) => projectOf(state) !== null)
    const gate = holdWrites(memory)
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, (state) => state.inFlight?.kind === "open")
    // Another screen writes, so this one reads once its write lands.
    memory.gate.hold = null
    await memory.store.update(
      "other",
      () =>
        newProject("other", {
          author: "claude",
          message: "Primer",
          at: AT,
          cutList: cutListOf(primer()),
          primer: primer(),
        }).project
    )
    await until(runtime, (state) => state.stale)
    // Neither screen is on view when the notice is kept.
    other.detach()
    runtime.detach()
    await memory.store.remember(STUDIO_WORDS.notice.notKept)
    gate.open()
    await until(runtime, (state) => !state.stale && state.inFlight === null)
    await until(runtime, (state) => projectsOfState(state).length === 2)
    expect([...memory.notices.values()]).toEqual([STUDIO_WORDS.notice.notKept])
  })
})

/**
 * VC1 (`@some-ui/voice-capture`'s `takeRunner`) as Studio meets it: every
 * write held behind Done for now is let through within a bounded time of
 * it, over each way the microphone can answer (open never or late, finish
 * never), and a take begun while the microphone opened never lands in the
 * sitting Done for now closed (#2304).
 */
describe("VC1: a microphone that is slow or silent holds nothing for good", () => {
  /** A microphone the test opens by hand, or never. */
  function heldMic(): {
    mic: StartRecording
    open: () => void
    discarded: () => number
  } {
    let open: () => void = () => undefined
    let discards = 0
    const mic: StartRecording = () =>
      new Promise((resolve) => {
        open = (): void => {
          void fakeMic()().then((recording) =>
            resolve({
              ...recording,
              discard: (): void => {
                discards++
              },
            })
          )
        }
      })
    return { mic, open: () => open(), discarded: () => discards }
  }

  it("closes the sitting when the microphone never opens", async () => {
    const memory = memoryProjectStore()
    const silent = heldMic()
    const runtime = await opened(memory, silent.mic, {
      openMs: 30,
      finishMs: 30,
    })
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "opening")
    runtime.dispatch({ type: "doneForNowPressed" })
    await until(
      runtime,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    const project = projectIn(runtime)
    expect(project.sittings.at(-1)?.closedAt).toBeDefined()
  })

  it("closes the sitting when Done for now waits on a recording that never gives back what it heard", async () => {
    const memory = memoryProjectStore()
    const silent: StartRecording = () =>
      Promise.resolve({
        level: (): number => 0.3,
        finish: (): Promise<Take> => new Promise<Take>(() => undefined),
        discard: (): void => undefined,
      })
    const runtime = await opened(memory, silent, { openMs: 30, finishMs: 30 })
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "recording")
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "saving")
    runtime.dispatch({ type: "doneForNowPressed" })
    await until(
      runtime,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    const project = projectIn(runtime)
    expect(project.takes).toEqual([])
    expect(project.sittings.at(-1)?.closedAt).toBeDefined()
  })

  it("lets go of a microphone that opens after Done for now, and starts no take", async () => {
    const memory = memoryProjectStore()
    const slow = heldMic()
    const runtime = await opened(memory, slow.mic)
    runtime.dispatch({ type: "recordChosen" })
    runtime.dispatch({ type: "recordPressed" })
    await until(runtime, (state) => state.activity.kind === "opening")
    runtime.dispatch({ type: "doneForNowPressed" })
    runtime.dispatch({ type: "notYetPressed" })
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, (state) => state.screen.kind === "record")
    slow.open()
    await until(
      runtime,
      (state) => state.activity.kind === "idle" && settledWrites(state)
    )
    expect(slow.discarded()).toBe(1)
    const project = projectIn(runtime)
    expect(project.takes).toEqual([])
    expect(project.sittings.at(-1)?.closedAt).toBeDefined()
  })
})

/** ST9: the runtime logs each screen of a sitting, and nothing outside one. */
describe("Studio's time log", () => {
  /** A video opened on a runtime that keeps its time log in `storage`. */
  async function logged(): Promise<{
    runtime: StudioRuntime
    storage: ReturnType<typeof inMemoryStorage>
  }> {
    const storage = inMemoryStorage()
    const memory = memoryProjectStore()
    let tick = 0
    let ids = 0
    const runtime = createStudio({
      store: memory.store,
      startRecording: fakeMic(),
      now: () => NOW + 1_000 * tick++,
      newId: () => `id${++ids}`,
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
      timeLog: keptTimeLog(() => storage),
    })
    runtime.attach()
    await until(runtime, (state) => state.shelf.kind === "read")
    runtime.dispatch({
      type: "primerPicked",
      file: new Blob([PRIMER_TEXT], { type: "application/json" }),
    })
    await until(
      runtime,
      (state) => projectOf(state) !== null && settledWrites(state)
    )
    return { runtime, storage }
  }

  it("logs a sitting's screens from Record to Done for now", async () => {
    const { runtime, storage } = await logged()
    expect(keptTimeLog(() => storage).read()).toEqual([])
    runtime.dispatch({ type: "recordChosen" })
    await until(runtime, settledWrites)
    await recordOne(runtime)
    runtime.dispatch({ type: "doneForNowPressed" })
    await until(runtime, settledWrites)
    const events = keptTimeLog(() => storage).read()
    expect(events.map((event) => [event.type, event.screen])).toEqual([
      ["sitting_opened", null],
      ["screen_entered", "record:path"],
      ["screen_left", "record:path"],
      ["screen_entered", "done"],
      ["screen_left", "done"],
      ["sitting_closed", null],
    ])
    expect(new Set(events.map((event) => event.sitting)).size).toBe(1)
  })

  it("opens a sitting for Shape, Watch and Finish too, logged as that kind", async () => {
    const { runtime, storage } = await logged()
    runtime.dispatch({ type: "shapeChosen" })
    await until(runtime, settledWrites)
    const events = keptTimeLog(() => storage).read()
    expect(
      events.map((event) => [event.type, event.kind, event.screen])
    ).toEqual([
      ["sitting_opened", "shape", null],
      ["screen_entered", "shape", "shape"],
    ])
  })
})

/** ST6: Shape writes the chosen plans as the owner's revision, and nothing more. */
describe("Shape", () => {
  it("keeps a Look and a Voice plan as a new version of the video", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const before = latest(projectIn(runtime)).cutList
    runtime.dispatch({ type: "shapeChosen" })
    expect(runtime.getSnapshot().screen).toEqual({
      kind: "shape",
      step: "look",
      look: before.look,
      voice: before.voice,
    })
    runtime.dispatch({ type: "lookPicked", look: "lively" })
    runtime.dispatch({ type: "shapeNext" })
    runtime.dispatch({ type: "voicePicked", voice: "read" })
    runtime.dispatch({ type: "shapeKept" })
    await until(runtime, settledWrites)
    const kept = latest(projectIn(runtime))
    expect(kept.author).toBe("owner")
    expect(kept.cutList).toEqual({ ...before, look: "lively", voice: "read" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "start" })
    expect(runtime.getSnapshot().notice).toBe(
      STUDIO_WORDS.shape.kept("lively", "read")
    )
  })

  it("writes nothing when the plans are the ones kept", async () => {
    const memory = memoryProjectStore()
    const runtime = await opened(memory)
    const revisions = projectIn(runtime).revisions.length
    runtime.dispatch({ type: "shapeChosen" })
    runtime.dispatch({ type: "shapeNext" })
    runtime.dispatch({ type: "shapeKept" })
    await until(runtime, settledWrites)
    expect(projectIn(runtime).revisions).toHaveLength(revisions)
  })

  it("goes back a step, then to Start, keeping nothing", async () => {
    const runtime = await opened()
    runtime.dispatch({ type: "shapeChosen" })
    runtime.dispatch({ type: "shapeNext" })
    runtime.dispatch({ type: "shapeBack" })
    expect(runtime.getSnapshot().screen).toMatchObject({ step: "look" })
    runtime.dispatch({ type: "shapeBack" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "start" })
  })
})

/** ST7: Finish names the one thing missing, then keeps the mark and the link. */
describe("Finish", () => {
  /** A video kept on the phone with every scene taken. */
  async function taken(): Promise<Running> {
    const state = ["a", "b", "c"].reduce(
      (at, id) =>
        run(at, { type: "takeStarted", shot: id }, take(`t-${id}`, id)),
      started()
    )
    const runtime = studio(memoryProjectStore([state.project]))
    await until(runtime, (each) => projectOf(each) !== null)
    runtime.dispatch({ type: "finishChosen" })
    return runtime
  }

  it("goes straight to the first scene with no take", async () => {
    const runtime = await opened()
    runtime.dispatch({ type: "finishChosen" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "finish" })
    runtime.dispatch({ type: "finishGo" })
    const [first] = latest(projectIn(runtime)).cutList.shots
    expect(runtime.getSnapshot().screen).toEqual({
      kind: "record",
      shot: first?.id,
    })
  })

  it("keeps the owner's mark, then the YouTube link, on the latest version", async () => {
    const runtime = await taken()
    runtime.dispatch({
      type: "linkPasted",
      text: "https://youtu.be/dQw4w9WgXcQ",
    })
    expect(finishOf(projectIn(runtime)).kind).toBe("unmarked")
    runtime.dispatch({ type: "readyMarked" })
    await until(runtime, (state) => settledWrites(state))
    expect(finishOf(projectIn(runtime))).toEqual({ kind: "ready", rev: 1 })
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.finish.marked)
    runtime.dispatch({ type: "linkPasted", text: "https://example.com/v" })
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.finish.notALink)
    runtime.dispatch({
      type: "linkPasted",
      text: "https://youtu.be/dQw4w9WgXcQ",
    })
    await until(runtime, (state) => settledWrites(state))
    expect(finishOf(projectIn(runtime))).toEqual({
      kind: "released",
      rev: 1,
      url: "https://youtu.be/dQw4w9WgXcQ",
    })
  })
})

/** ST8: Claude's version comes back as a file, picked as a primer is, and adds. */
describe("a version back from Claude", () => {
  const pick = (runtime: StudioRuntime, project: Project): void =>
    runtime.dispatch({
      type: "primerPicked",
      file: new Blob([projectFile(project)], { type: "application/json" }),
    })

  it("adds Claude's version to the video on the phone, and says so", async () => {
    const runtime = await opened()
    const kept = projectIn(runtime)
    const back = run(
      { project: kept, taking: null, closing: null },
      {
        type: "revised",
        author: "claude",
        message: "Scene 2 slower",
        at: AT,
        cutList: latest(kept).cutList,
      }
    ).project
    pick(runtime, back)
    await until(
      runtime,
      (state) =>
        settledWrites(state) &&
        state.notice === STUDIO_WORDS.merge.merged("Scene 2 slower")
    )
    expect(latest(projectIn(runtime)).message).toBe("Scene 2 slower")
    expect(projectIn(runtime).revisions).toHaveLength(kept.revisions.length + 1)
  })

  /** A Shape kept here after `kept` was shared: the look is now Lively. */
  async function shapedAfterSharing(runtime: StudioRuntime): Promise<void> {
    runtime.dispatch({ type: "shapeChosen" })
    runtime.dispatch({ type: "lookPicked", look: "lively" })
    runtime.dispatch({ type: "shapeNext" })
    runtime.dispatch({ type: "shapeKept" })
    await until(runtime, settledWrites)
  }

  const claudes = (kept: Project, cutList: CutListShape): Project =>
    run(
      { project: kept, taking: null, closing: null },
      {
        type: "revised",
        author: "claude",
        message: "Claude's cut",
        at: AT,
        cutList,
      }
    ).project

  it("comes in after a version made here, numbered after it (#2317)", async () => {
    const runtime = await opened()
    const kept = projectIn(runtime)
    await shapedAfterSharing(runtime)
    const revisions = projectIn(runtime).revisions.length
    const { cutList } = latest(kept)
    const [first, ...rest] = cutList.shots
    if (first === undefined) throw new Error("a video has a scene")
    pick(
      runtime,
      claudes(kept, {
        ...cutList,
        shots: [{ ...first, overrides: { transitionIn: "cut" } }, ...rest],
      })
    )
    await until(
      runtime,
      (state) =>
        settledWrites(state) &&
        state.notice === STUDIO_WORDS.merge.merged("Claude's cut")
    )
    const now = latest(projectIn(runtime))
    expect(now.rev).toBe(revisions + 1)
    expect(now.cutList.look).toBe("lively")
    expect(now.cutList.shots[0]?.overrides).toEqual({ transitionIn: "cut" })
  })

  it("keeps what this phone chose where Claude changed it too, and says so", async () => {
    const runtime = await opened()
    const kept = projectIn(runtime)
    await shapedAfterSharing(runtime)
    pick(runtime, claudes(kept, { ...latest(kept).cutList, look: "plain" }))
    const revisions = projectIn(runtime).revisions.length
    await until(
      runtime,
      (state) =>
        state.notice === STUDIO_WORDS.merge.kept({ scenes: [], plans: true })
    )
    expect(projectIn(runtime).revisions).toHaveLength(revisions)
    expect(latest(projectIn(runtime)).cutList.look).toBe("lively")
  })
})

/** ST5: Watch pins a note to the moment of the review render on screen. */
describe("Watch", () => {
  /** Watch open on a review render of the latest version; its scenes' times. */
  async function watching(
    runtime: StudioRuntime
  ): Promise<ReadonlyArray<ShotTime>> {
    const { rev, cutList } = latest(projectIn(runtime))
    let start = 0
    const shotTimes = cutList.shots.map((each) => {
      const at = start
      start += each.durationMs
      return {
        id: each.id,
        cut: null,
        startMs: at,
        durationMs: each.durationMs,
      }
    })
    runtime.dispatch({ type: "watchChosen" })
    runtime.dispatch({
      type: "reviewPicked",
      files: [
        new Blob(["v"], { type: "video/mp4" }),
        new Blob(
          [
            JSON.stringify({
              schema: REVIEW_SCHEMA,
              title: cutList.title,
              rev,
              shotTimes,
            }),
          ],
          {
            type: "application/json",
          }
        ),
      ],
    })
    await until(
      runtime,
      (state) => state.screen.kind === "watch" && state.screen.review !== null
    )
    return shotTimes
  }

  it("pins a note to the scene and offset playing, from the render's own times", async () => {
    const runtime = await opened()
    const { rev } = latest(projectIn(runtime))
    const [, second] = await watching(runtime)
    if (second === undefined) throw new Error("scenes")
    runtime.dispatch({ type: "playheadAt", ms: second.startMs + 250 })
    runtime.dispatch({ type: "notedHere", text: "Hold the list longer" })
    await until(
      runtime,
      (state) =>
        settledWrites(state) && state.notice === STUDIO_WORDS.watch.noted
    )
    expect(projectIn(runtime).notes).toEqual([
      expect.objectContaining({
        rev,
        shot: second.id,
        offsetMs: 250,
        author: "owner",
        text: "Hold the list longer",
        status: "open",
      }),
    ])
  })

  /** A recognizer the test speaks through: ready, words as heard, then the end. */
  function fakeListener(available = true): {
    listener: IdeaListener
    ready: () => void
    say: (words: string) => void
    end: (result: Listened) => void
    listens: () => number
    stops: () => number
  } {
    let onWords: (words: string) => void = () => undefined
    let onReady: () => void = () => undefined
    let settle: (result: Listened) => void = () => undefined
    let count = 0
    let stopped = 0
    return {
      listener: {
        available: () => Promise.resolve(available),
        listen: (heard, ready): Listening => {
          count += 1
          onWords = heard
          onReady = ready
          return {
            done: new Promise<Listened>((resolve) => {
              settle = resolve
            }),
            stop: (): void => {
              stopped += 1
            },
            cancel: () => undefined,
          }
        },
      },
      ready: () => onReady(),
      say: (words) => onWords(words),
      end: (result) => settle(result),
      listens: () => count,
      stops: () => stopped,
    }
  }

  const speakingIn = (
    state: ReturnType<StudioRuntime["getSnapshot"]>
  ): Speaking | null =>
    state.screen.kind === "watch" ? state.screen.speaking : null

  it("pins a spoken note to the moment it was begun, once its words are kept (ST5)", async () => {
    const voice = fakeListener()
    const runtime = await opened(
      undefined,
      undefined,
      undefined,
      voice.listener
    )
    const { rev } = latest(projectIn(runtime))
    const [, second] = await watching(runtime)
    if (second === undefined) throw new Error("scenes")
    await until(
      runtime,
      (state) =>
        state.screen.kind === "watch" && state.screen.listen === "available"
    )
    runtime.dispatch({ type: "playheadAt", ms: second.startMs + 400 })
    runtime.dispatch({ type: "speakPressed" })
    voice.say("Hold the")
    expect(speakingIn(runtime.getSnapshot())?.words).toBe("Hold the")
    // The render plays on while the note is said.
    runtime.dispatch({ type: "playheadAt", ms: second.startMs + 1_900 })
    voice.end({ kind: "heard", words: "Hold the list longer " })
    await until(runtime, (state) => speakingIn(state)?.phase === "heard")
    expect(projectIn(runtime).notes).toEqual([])
    runtime.dispatch({ type: "spokenKept" })
    await until(
      runtime,
      (state) =>
        settledWrites(state) && state.notice === STUDIO_WORDS.watch.noted
    )
    expect(projectIn(runtime).notes).toEqual([
      expect.objectContaining({
        rev,
        shot: second.id,
        offsetMs: 400,
        author: "owner",
        text: "Hold the list longer",
      }),
    ])
  })

  it("says it again, or lets it go, and keeps nothing it wasn't told to", async () => {
    const voice = fakeListener()
    const runtime = await opened(
      undefined,
      undefined,
      undefined,
      voice.listener
    )
    await watching(runtime)
    await until(
      runtime,
      (state) =>
        state.screen.kind === "watch" && state.screen.listen === "available"
    )
    runtime.dispatch({ type: "speakPressed" })
    voice.end({ kind: "heard", words: "Too fast" })
    await until(runtime, (state) => speakingIn(state)?.phase === "heard")
    runtime.dispatch({ type: "spokenAgain" })
    expect(voice.listens()).toBe(2)
    voice.end({ kind: "heard", words: "" })
    await until(
      runtime,
      (state) => state.notice === STUDIO_WORDS.watch.heardNothing
    )
    expect(speakingIn(runtime.getSnapshot())).toBeNull()
    runtime.dispatch({ type: "speakPressed" })
    voice.end({ kind: "heard", words: "Slower" })
    await until(runtime, (state) => speakingIn(state)?.phase === "heard")
    runtime.dispatch({ type: "spokenDropped" })
    expect(speakingIn(runtime.getSnapshot())).toBeNull()
    expect(projectIn(runtime).notes).toEqual([])
  })

  it("is getting ready, then finishing, and says when the recognizer never started (LS1)", async () => {
    const voice = fakeListener()
    const runtime = await opened(
      undefined,
      undefined,
      undefined,
      voice.listener
    )
    await watching(runtime)
    await until(
      runtime,
      (state) =>
        state.screen.kind === "watch" && state.screen.listen === "available"
    )
    runtime.dispatch({ type: "speakPressed" })
    expect(speakingIn(runtime.getSnapshot())).toMatchObject({
      phase: "listening",
      ready: false,
    })
    voice.ready()
    expect(speakingIn(runtime.getSnapshot())?.ready).toBe(true)
    voice.say("Hold")
    runtime.dispatch({ type: "speakStopped" })
    expect(speakingIn(runtime.getSnapshot())).toMatchObject({
      phase: "finishing",
      words: "Hold",
    })
    expect(voice.stops()).toBe(1)
    // Words still arriving while finishing count.
    voice.say("Hold the list")
    voice.end({ kind: "heard", words: "" })
    await until(runtime, (state) => speakingIn(state)?.phase === "heard")
    expect(speakingIn(runtime.getSnapshot())?.words).toBe("Hold the list")
    runtime.dispatch({ type: "spokenDropped" })

    runtime.dispatch({ type: "speakPressed" })
    voice.end({ kind: "notStarted" })
    await until(
      runtime,
      (state) => state.notice === STUDIO_WORDS.watch.notStarted
    )
    expect(speakingIn(runtime.getSnapshot())).toBeNull()
    // The phone can still listen; the next note may try the voice again.
    const { screen } = runtime.getSnapshot()
    expect(screen.kind === "watch" && screen.listen).toBe("available")
  })

  it("takes typed notes only, on a phone that can't listen", async () => {
    const voice = fakeListener(false)
    const runtime = await opened(
      undefined,
      undefined,
      undefined,
      voice.listener
    )
    await watching(runtime)
    await until(
      runtime,
      (state) =>
        state.screen.kind === "watch" && state.screen.listen === "unavailable"
    )
    runtime.dispatch({ type: "speakPressed" })
    expect(voice.listens()).toBe(0)
  })

  it("asks for the video and the notes beside it together", async () => {
    const runtime = await opened()
    runtime.dispatch({ type: "watchChosen" })
    runtime.dispatch({
      type: "reviewPicked",
      files: [new Blob(["v"], { type: "video/mp4" })],
    })
    expect(runtime.getSnapshot().notice).toBe(STUDIO_WORDS.watch.pickBoth)
  })
})

/** ST4's quiet links: History and Time spent, each back to Start. */
describe("Start's quiet links", () => {
  it("reads the time log for Time spent, and goes back to Start", async () => {
    const runtime = await opened()
    runtime.dispatch({ type: "timeChosen" })
    await until(
      runtime,
      (state) => state.screen.kind === "time" && state.screen.log !== null
    )
    runtime.dispatch({ type: "quietBack" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "start" })
    runtime.dispatch({ type: "historyChosen" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "history" })
  })
})

/** ST5: a review is checked against the video on screen before it plays. */
describe("a review of another video", () => {
  it("is refused when its title or scenes differ, whatever its revision", async () => {
    const runtime = await opened()
    const { rev, cutList } = latest(projectIn(runtime))
    runtime.dispatch({ type: "watchChosen" })
    runtime.dispatch({
      type: "reviewPicked",
      files: [
        new Blob(["v"], { type: "video/mp4" }),
        new Blob(
          [
            JSON.stringify({
              schema: REVIEW_SCHEMA,
              title: `${cutList.title}, another`,
              rev,
              shotTimes: cutList.shots.map((each, index) => ({
                id: each.id,
                cut: null,
                startMs: index * 1_000,
                durationMs: 1_000,
              })),
            }),
          ],
          { type: "application/json" }
        ),
      ],
    })
    await until(
      runtime,
      (state) => state.notice === STUDIO_WORDS.watch.notThisVideo
    )
    expect(runtime.getSnapshot().screen).toMatchObject({
      kind: "watch",
      review: null,
      video: null,
    })
  })
})

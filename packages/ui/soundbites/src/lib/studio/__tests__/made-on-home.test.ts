/**
 * @vitest-environment node
 *
 * Finish handing a ready episode to home to make (ST33): the mark is kept
 * first and only then handed over, and Finish says where it stands from
 * what the home link knows, in the person's terms.
 */
import type { Playback } from "@some-ui/voice-capture"
import { episodeProjectOf } from "@soundbites/fixtures"
import { queue, run, take } from "@soundbites/lib/project/__tests__/fixture"
import type { VideoForHome } from "@soundbites/lib/project/dna"
import { videoKey } from "@soundbites/lib/project/dna"
import { latestShot } from "@soundbites/lib/project/lookup"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { Project, ProjectState } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import type { HomeVideos, VideosHome } from "@soundbites/lib/studio/home-videos"
import { finishHome, NO_HOME_VIDEOS } from "@soundbites/lib/studio/home-videos"
import { projectOf } from "@soundbites/lib/studio/machine"
import type { StudioRuntime } from "@soundbites/lib/studio/runtime"
import { createStudio } from "@soundbites/lib/studio/runtime"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { describe, expect, it, vi } from "vitest"

import { AT, episodeText, speaking } from "./fixture"

const WORDS = STUDIO_WORDS.finish.toHome
const QUEUED_AT = "2026-11-05T17:02:11.123Z"
const STORED_AT = "2026-11-05T17:05:00.000Z"

/** An episode of Weekly with every scene taken and its idea said. */
function taken(): ProjectState {
  const opened = episodeProjectOf("w3", episodeText(), AT)
  return latest(opened.project).cutList.shots.reduce((at, { id }) => {
    const idea = latestShot(at.project, id)?.idea ?? { origin: "agent" }
    return run(at, { type: "takeStarted", shot: id }, take(`t-${id}`, id), {
      type: "originSaid",
      shot: id,
      idea,
      at: AT,
    })
  }, opened)
}

const ready = (): ProjectState =>
  run(taken(), { type: "markedReady", rev: 1, at: AT })

const queued = (): Project => queue(ready(), QUEUED_AT).project

const KEY = videoKey("w3", 1)

const heard = (over: Partial<HomeVideos>): HomeVideos => ({
  ...NO_HOME_VIDEOS,
  ...over,
})

describe("Finish's part about home making it (ST33)", () => {
  it("offers nothing before the episode is ready, then the offer", () => {
    expect(finishHome(taken().project, NO_HOME_VIDEOS)).toBeNull()
    expect(finishHome(ready().project, NO_HOME_VIDEOS)).toEqual({
      kind: "offer",
    })
  })

  it("says why it waits on this phone: not paired, or away from home, and nothing of pairing until it is known", () => {
    const since = WORDS.when(QUEUED_AT)
    const line = (videos: HomeVideos): unknown => finishHome(queued(), videos)
    expect(line(heard({ reach: "unpaired" }))).toEqual({
      kind: "standing",
      line: WORDS.notNear.unpaired(since),
    })
    expect(line(heard({ reach: "away" }))).toEqual({
      kind: "standing",
      line: WORDS.notNear.away(since),
    })
    // Before the phone has read whether it is paired (ST34).
    expect(line(heard({ reach: "unknown" }))).toEqual({
      kind: "standing",
      line: WORDS.notNear.unknown(since),
    })
    expect(WORDS.notNear.unknown(since)).not.toMatch(/paired|reach|network/)
    expect(line(heard({ reach: "near" }))).toEqual({
      kind: "standing",
      line: WORDS.going(since),
    })
  })

  it("says since when home has it, and a stage this version can't name as one", () => {
    const listed = (stage: "queued" | "other"): unknown =>
      finishHome(
        queued(),
        heard({
          reach: "away",
          answers: { [KEY]: { kind: "held" } },
          listed: { [KEY]: { storedAt: STORED_AT, stage } },
        })
      )
    expect(listed("queued")).toEqual({
      kind: "standing",
      line: WORDS.onHome(WORDS.when(STORED_AT)),
    })
    expect(listed("other")).toEqual({
      kind: "standing",
      line: WORDS.onHomeOther(WORDS.when(STORED_AT)),
    })
    expect(
      finishHome(queued(), heard({ answers: { [KEY]: { kind: "held" } } }))
    ).toEqual({ kind: "standing", line: WORDS.held })
  })

  it("names the scene whose take home doesn't hold yet, by the name the show gives it", () => {
    expect(
      finishHome(
        queued(),
        heard({
          reach: "near",
          answers: { [KEY]: { kind: "missing", notes: ["t-close"] } },
        })
      )
    ).toEqual({ kind: "standing", line: WORDS.missing(["The close"]) })
    // It may come, or, set aside or deleted for good, never: both said.
    expect(WORDS.missing(["The close"])).toContain("your take for The close")
    expect(WORDS.missing(["The close"])).toMatch(
      /deleted for good.*another take/
    )
    // A take this phone heard home deleted for good: it won't come.
    const project = queued()
    const deleted = {
      ...project,
      takes: project.takes.map((each) =>
        each.id === "t-close" ? { ...each, deletedAt: STORED_AT } : each
      ),
    }
    expect(
      finishHome(
        deleted,
        heard({
          reach: "near",
          answers: { [KEY]: { kind: "missing", notes: ["t-close"] } },
        })
      )
    ).toEqual({ kind: "standing", line: WORDS.deleted(["The close"]) })
    expect(WORDS.deleted(["The close"])).not.toMatch(/goes again/)
  })

  it("says home didn't take it, and that it stays on this phone", () => {
    expect(
      finishHome(queued(), heard({ answers: { [KEY]: { kind: "refused" } } }))
    ).toEqual({ kind: "standing", line: WORDS.refused })
  })
})

/** A fake home link: what it was handed, and a snapshot a test moves. */
function fakeHome(): VideosHome & {
  readonly given: Array<VideoForHome>
  readonly move: (videos: HomeVideos) => void
} {
  let now = NO_HOME_VIDEOS
  const listeners = new Set<() => void>()
  const given: Array<VideoForHome> = []
  return {
    given,
    handed: (video): void => {
      given.push(video)
    },
    getSnapshot: () => now,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    move: (videos): void => {
      now = videos
      for (const listener of listeners) listener()
    },
  }
}

function studio(
  projects: ReadonlyArray<Project>,
  videos?: VideosHome
): StudioRuntime {
  const memory = memoryProjectStore(projects)
  const runtime = createStudio({
    store: memory.store,
    startRecording: speaking(),
    now: () => Date.parse(QUEUED_AT),
    newId: () => "id",
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
    ...(videos === undefined ? {} : { videos }),
  })
  runtime.attach()
  return runtime
}

async function until(
  runtime: StudioRuntime,
  ready: (state: ReturnType<StudioRuntime["getSnapshot"]>) => boolean
): Promise<void> {
  await vi.waitFor(() => expect(ready(runtime.getSnapshot())).toBe(true))
}

const settled = (state: ReturnType<StudioRuntime["getSnapshot"]>): boolean =>
  state.inFlight === null && state.queue.length === 0

describe("Finish handing an episode to home (ST33)", () => {
  it("keeps the mark, then hands its DNA over, once", async () => {
    const home = fakeHome()
    const runtime = studio([ready().project], home)
    await until(runtime, (state) => projectOf(state) !== null)
    runtime.dispatch({ type: "finishChosen" })
    await until(runtime, settled)
    runtime.dispatch({ type: "homeAsked" })
    await until(runtime, (state) => settled(state) && home.given.length > 0)
    const project = projectOf(runtime.getSnapshot())
    const mark = project?.queued?.[0]
    expect(project?.queued).toEqual([
      {
        rev: 1,
        at: QUEUED_AT,
        takes: [
          { scene: "open", note: "t-open" },
          { scene: "close", note: "t-close" },
        ],
        dna: mark?.dna,
      },
    ])
    expect(home.given.map((video) => video.key)).toEqual(["w3/1"])
    // What is handed over is the DNA the mark keeps.
    expect(home.given[0]?.body).toBe(mark?.dna)
    expect(JSON.parse(home.given[0]?.body ?? "")).toMatchObject({
      video: "w3",
      rev: 1,
      queuedAt: QUEUED_AT,
    })
    expect(runtime.getSnapshot().notice).toBe(WORDS.handed)
    // Asked again, it is kept already: nothing more is handed over.
    runtime.dispatch({ type: "homeAsked" })
    await until(runtime, settled)
    expect(home.given).toHaveLength(1)
  })

  it("hands nothing over for an episode not ready, or a mark not kept", async () => {
    const home = fakeHome()
    const runtime = studio([taken().project], home)
    await until(runtime, (state) => projectOf(state) !== null)
    runtime.dispatch({ type: "finishChosen" })
    await until(runtime, settled)
    runtime.dispatch({ type: "homeAsked" })
    await until(runtime, settled)
    expect(home.given).toEqual([])
    expect(projectOf(runtime.getSnapshot())?.queued).toBeUndefined()
  })

  it("hears what the home link knows, as it moves", async () => {
    const home = fakeHome()
    const runtime = studio([queued()], home)
    await until(runtime, (state) => projectOf(state) !== null)
    expect(runtime.getSnapshot().videos).toBe(NO_HOME_VIDEOS)
    const now = heard({ reach: "away" })
    home.move(now)
    expect(runtime.getSnapshot().videos).toBe(now)
  })

  it("on a build with no home link, says the video waits on this phone", async () => {
    const runtime = studio([queued()])
    await until(runtime, (state) => projectOf(state) !== null)
    const project = projectOf(runtime.getSnapshot())
    if (project === null) throw new Error("no project")
    expect(finishHome(project, runtime.getSnapshot().videos)).toEqual({
      kind: "standing",
      line: WORDS.notNear.unpaired(WORDS.when(QUEUED_AT)),
    })
  })
})

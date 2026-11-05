/** @vitest-environment node */
import { parseVideoDna, VIDEO_DNA_SCHEMA } from "@some-ui/video-render"
import { episodeProjectOf } from "@soundbites/fixtures"
import {
  dnaBody,
  dnaOf,
  queueRefusal,
  videosForHome,
} from "@soundbites/lib/project/dna"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { latestShot } from "@soundbites/lib/project/lookup"
import type { ProjectState, Queued } from "@soundbites/lib/project/model"
import { isAppendOnly, latest, step } from "@soundbites/lib/project/model"
import { episodeText } from "@soundbites/lib/studio/__tests__/fixture"
import { describe, expect, it } from "vitest"

import { AT, run, started, take } from "./fixture"

const QUEUED_AT = "2026-11-05T17:02:11.123Z"

/** `state` with every scene of its latest version taken and its idea said. */
function taken(state: ProjectState): ProjectState {
  return latest(state.project).cutList.shots.reduce((at, { id }) => {
    const idea = latestShot(at.project, id)?.idea ?? { origin: "agent" }
    return run(at, { type: "takeStarted", shot: id }, take(`t-${id}`, id), {
      type: "originSaid",
      shot: id,
      idea,
      at: AT,
    })
  }, state)
}

/** An episode of Weekly, every scene taken, marked ready. */
const ready = (): ProjectState =>
  run(taken(episodeProjectOf("w3", episodeText(), AT)), {
    type: "markedReady",
    rev: 1,
    at: AT,
  })

const queued = (state: ProjectState = ready()): ProjectState =>
  run(state, { type: "queued", rev: 1, at: QUEUED_AT })

function markOf(state: ProjectState): Queued {
  const mark = state.project.queued?.at(-1)
  if (mark === undefined) throw new Error("not queued")
  return mark
}

describe("the queued mark (ST33)", () => {
  it("keeps the take each scene says, once, on a ready episode's latest version", () => {
    const state = queued()
    expect(state.project.queued).toEqual([
      {
        rev: 1,
        at: QUEUED_AT,
        takes: [
          { scene: "open", note: "t-open" },
          { scene: "close", note: "t-close" },
        ],
      },
    ])
    expect(step(state, { type: "queued", rev: 1, at: QUEUED_AT }).refused).toBe(
      "duplicate"
    )
  })

  it("is refused before the episode is ready, and on a video of your own", () => {
    const unmarked = taken(episodeProjectOf("w3", episodeText(), AT))
    expect(
      step(unmarked, { type: "queued", rev: 1, at: QUEUED_AT }).refused
    ).toBe("notReady")
    const own = run(taken(started()), {
      type: "markedReady",
      rev: 1,
      at: AT,
    })
    expect(step(own, { type: "queued", rev: 1, at: QUEUED_AT }).refused).toBe(
      "noTemplate"
    )
    expect(
      step(ready(), { type: "queued", rev: 2, at: QUEUED_AT }).refused
    ).toBe("notLatest")
  })

  it("is never dropped or rewritten by a save, and goes with the project's file", () => {
    const before = queued().project
    expect(isAppendOnly(before, { ...before, queued: [] })).toBe(false)
    expect(
      isAppendOnly(before, {
        ...before,
        queued: [{ ...markOf(queued()), takes: [] }],
      })
    ).toBe(false)
    const read = readProjectFile(projectFile(before))
    expect(read.ok && read.value.queued).toEqual(before.queued)
  })
})

describe("dnaOf (ST33)", () => {
  it("makes an episode's DNA from its version, its pins and the mark's takes", () => {
    const state = queued()
    const dna = dnaOf(state.project, markOf(state))
    if (!dna.ok) throw new Error(dna.problems.join("; "))
    expect(dna.value).toMatchObject({
      schema: VIDEO_DNA_SCHEMA,
      video: "w3",
      rev: 1,
      title: "Weekly, week 3",
      queuedAt: QUEUED_AT,
      template: { kind: "show-format", id: "weekly", version: 1 },
      takes: [
        { scene: "open", note: "t-open" },
        { scene: "close", note: "t-close" },
      ],
      data: {
        episode: state.project.episode,
        scenes: [
          { scene: "open", point: "How it opens", keep: ["3 wins"] },
          { scene: "close", point: "How it closes", keep: ["One loss"] },
        ],
      },
    })
    expect(dna.value.shape.shots.map((shot) => shot.id)).toEqual([
      "open",
      "close",
    ])
    // What home is sent reads back as the same DNA.
    expect(parseVideoDna(JSON.parse(dnaBody(dna.value)))).toEqual(dna)
  })

  it("is the same bytes each time, whatever is chosen or noted after the mark", () => {
    const state = queued()
    const first = dnaOf(state.project, markOf(state))
    const later = run(
      state,
      { type: "takeStarted", shot: "open" },
      take("t-open-2", "open"),
      {
        type: "noted",
        note: {
          id: "n-after",
          rev: markOf(state).rev,
          shot: "open",
          offsetMs: 0,
          author: "owner",
          text: "Say it slower.",
        },
      }
    )
    expect(later.project.notes.map(({ id }) => id)).toContain("n-after")
    const again = dnaOf(later.project, markOf(later))
    if (!first.ok || !again.ok) throw new Error("no DNA")
    expect(dnaBody(again.value)).toBe(dnaBody(first.value))
  })

  it("makes none for a video of your own, which has no template yet", () => {
    const own = taken(started())
    const mark: Queued = { rev: 1, at: QUEUED_AT, takes: [] }
    expect(dnaOf(own.project, mark)).toEqual({
      ok: false,
      problems: ["a video of your own has no template yet"],
    })
    expect(queueRefusal(own.project, mark)).toBe("unmade")
  })

  it("is refused past home's 256 KiB, before anything is kept", () => {
    const state = queued()
    const huge = "x".repeat(300 * 1024)
    const big = {
      ...state.project,
      revisions: state.project.revisions.map((revision) => ({
        ...revision,
        cutList: { ...revision.cutList, title: "Weekly" },
        message: huge,
      })),
    }
    expect(queueRefusal(big, markOf(state))).toBe("tooLarge")
    expect(queueRefusal(state.project, markOf(state))).toBeNull()
    expect(videosForHome([big])).toEqual([])
  })

  it("lists every mark kept for home, oldest first", () => {
    const one = queued()
    const two = queued(
      run(taken(episodeProjectOf("w4", episodeText("week 4"), AT)), {
        type: "markedReady",
        rev: 1,
        at: AT,
      })
    )
    const later = {
      ...two.project,
      queued: two.project.queued?.map((mark) => ({
        ...mark,
        at: "2026-11-06T08:00:00.000Z",
      })),
    }
    expect(
      videosForHome([later, one.project]).map((video) => video.key)
    ).toEqual(["w3/1", "w4/1"])
    const [first] = videosForHome([one.project])
    const dna = dnaOf(one.project, markOf(one))
    if (!dna.ok) throw new Error("no DNA")
    expect(first?.body).toBe(dnaBody(dna.value))
  })
})

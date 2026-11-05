/** @vitest-environment node */
import { canonicalJson } from "@some-ui/core-utils"
import type { VideoDna } from "@some-ui/video-render"
import { parseVideoDna, VIDEO_DNA_SCHEMA } from "@some-ui/video-render"
import { episodeProjectOf } from "@soundbites/fixtures"
import {
  goneTakes,
  queueMark,
  videosForHome,
} from "@soundbites/lib/project/dna"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { latestShot } from "@soundbites/lib/project/lookup"
import type { ProjectState, Queued } from "@soundbites/lib/project/model"
import { isAppendOnly, latest, step } from "@soundbites/lib/project/model"
import { episodeText } from "@soundbites/lib/studio/__tests__/fixture"
import { describe, expect, it } from "vitest"

import { AT, queue, run, started, take } from "./fixture"

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
  queue(state, QUEUED_AT)

function markOf(state: ProjectState): Queued {
  const mark = state.project.queued?.at(-1)
  if (mark === undefined) throw new Error("not queued")
  return mark
}

/** The DNA a mark keeps, as home reads it. */
function dnaIn(mark: Queued): VideoDna {
  const dna = parseVideoDna(JSON.parse(mark.dna))
  if (!dna.ok) throw new Error(dna.problems.join("; "))
  return dna.value
}

describe("the queued mark (ST33)", () => {
  it("keeps the take each scene says and the DNA made of them, once, on a ready episode's latest version", () => {
    const state = queued()
    const mark = markOf(state)
    expect(state.project.queued).toEqual([
      {
        rev: 1,
        at: QUEUED_AT,
        takes: [
          { scene: "open", note: "t-open" },
          { scene: "close", note: "t-close" },
        ],
        dna: mark.dna,
      },
    ])
    expect(dnaIn(mark).takes).toEqual(mark.takes)
    expect(step(state, { type: "queued", ...mark }).refused).toBe("duplicate")
  })

  it("is refused before the episode is ready, on a video of your own, and on a version not the latest", () => {
    const unmarked = taken(episodeProjectOf("w3", episodeText(), AT))
    const made = queueMark(unmarked.project, QUEUED_AT)
    if ("refused" in made) throw new Error(made.refused)
    expect(step(unmarked, { type: "queued", ...made.mark }).refused).toBe(
      "notReady"
    )
    const own = run(taken(started()), {
      type: "markedReady",
      rev: 1,
      at: AT,
    })
    expect(queueMark(own.project, QUEUED_AT)).toEqual({ refused: "unmade" })
    expect(step(own, { type: "queued", ...made.mark, rev: 1 }).refused).toBe(
      "noTemplate"
    )
    expect(
      step(ready(), { type: "queued", ...made.mark, rev: 2 }).refused
    ).toBe("notLatest")
  })

  it("is never dropped or rewritten by a save, and goes with the project's file", () => {
    const before = queued().project
    const mark = markOf(queued())
    expect(isAppendOnly(before, { ...before, queued: [] })).toBe(false)
    expect(
      isAppendOnly(before, { ...before, queued: [{ ...mark, takes: [] }] })
    ).toBe(false)
    expect(
      isAppendOnly(before, {
        ...before,
        queued: [{ ...mark, dna: mark.dna.replace("Weekly", "Daily") }],
      })
    ).toBe(false)
    const read = readProjectFile(projectFile(before))
    expect(read.ok && read.value.queued).toEqual(before.queued)
    // A mark whose DNA is another video's, or another version's, is no mark.
    const other = {
      ...before,
      queued: [
        { ...mark, dna: mark.dna.replace('"video":"w3"', '"video":"w4"') },
      ],
    }
    expect(readProjectFile(projectFile(other)).ok).toBe(false)
  })
})

describe("queueMark (ST33)", () => {
  it("makes an episode's DNA from its version, its pins and the take each scene says", () => {
    const state = queued()
    const dna = dnaIn(markOf(state))
    expect(dna).toMatchObject({
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
    expect(dna.shape.shots.map((shot) => shot.id)).toEqual(["open", "close"])
    // Its canonical JSON: the same DNA is the same bytes.
    expect(markOf(state).dna).toBe(canonicalJson(dna))
  })

  it("keeps a scene's note its owner's idea cites, so the version is made as it reads", () => {
    const state = ready()
    const { project } = state
    const cited = {
      ...project,
      notes: [
        ...project.notes,
        {
          id: "n-mine",
          rev: 1,
          shot: "open",
          offsetMs: 0,
          author: "owner" as const,
          text: "Open on the wins.",
          status: "applied" as const,
        },
      ],
      revisions: project.revisions.map((revision) => ({
        ...revision,
        cutList: {
          ...revision.cutList,
          shots: revision.cutList.shots.map((shot) =>
            shot.id === "open"
              ? {
                  ...shot,
                  idea: {
                    origin: "you" as const,
                    from: { kind: "note" as const, id: "n-mine" },
                  },
                }
              : shot
          ),
        },
      })),
    }
    const made = queueMark(cited, QUEUED_AT)
    if ("refused" in made) throw new Error(made.refused)
    expect(dnaIn(made.mark).shape.notes.map(({ id }) => id)).toContain("n-mine")
  })

  it("is refused past home's 256 KiB, before anything is kept", () => {
    const { project } = ready()
    const huge = "x".repeat(300 * 1024)
    const big = {
      ...project,
      revisions: project.revisions.map((revision) => ({
        ...revision,
        message: huge,
      })),
    }
    expect(queueMark(big, QUEUED_AT)).toEqual({ refused: "tooLarge" })
    expect("mark" in queueMark(project, QUEUED_AT)).toBe(true)
  })
})

describe("videosForHome (ST33)", () => {
  it("sends the DNA the mark keeps, whatever is chosen, noted or made of the project since", () => {
    const state = queued()
    const mark = markOf(state)
    const later = run(
      state,
      { type: "takeStarted", shot: "open" },
      take("t-open-2", "open"),
      {
        type: "noted",
        note: {
          id: "n-after",
          rev: mark.rev,
          shot: "open",
          offsetMs: 0,
          author: "owner",
          text: "Say it slower.",
        },
      }
    )
    expect(later.project.notes.map(({ id }) => id)).toContain("n-after")
    // A newer app reading the same project another way (a default, a
    // changed shape) still sends the bytes the mark keeps.
    const reshaped = {
      ...later.project,
      revisions: later.project.revisions.map((revision) => ({
        ...revision,
        cutList: { ...revision.cutList, title: "Weekly, reshaped" },
      })),
    }
    for (const project of [later.project, reshaped])
      expect(videosForHome([project]).map(({ body }) => body)).toEqual([
        mark.dna,
      ])
  })

  it("lists every mark kept for home, oldest first, naming the takes home deleted for good", () => {
    const one = queued()
    const two = queue(
      run(taken(episodeProjectOf("w4", episodeText("week 4"), AT)), {
        type: "markedReady",
        rev: 1,
        at: AT,
      }),
      "2026-11-06T08:00:00.000Z"
    )
    expect(
      videosForHome([two.project, one.project]).map((video) => video.key)
    ).toEqual(["w3/1", "w4/1"])
    expect(videosForHome([one.project])[0]?.gone).toEqual([])
    const deleted = {
      ...one.project,
      takes: one.project.takes.map((each) =>
        each.id === "t-close" ? { ...each, deletedAt: AT } : each
      ),
    }
    expect(goneTakes(deleted, markOf(one))).toEqual(["t-close"])
    expect(videosForHome([deleted])[0]?.gone).toEqual(["t-close"])
  })
})

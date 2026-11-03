/** @vitest-environment node */
import { parseCutList, parseEpisode } from "@some-ui/video-render"
import { primerOf } from "@soundbites/fixtures"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import type { CutListShape, ProjectEvent } from "@soundbites/lib/project/model"
import { cutListAt, latest, step } from "@soundbites/lib/project/model"
import {
  capFor,
  currentOf,
  cutListOf,
  fitted,
  lengthFor,
  projectFromEpisode,
  projectIdFor,
  resumeAt,
  TAIL_MS,
} from "@soundbites/lib/project/script"
import { episodeText, primer } from "@soundbites/lib/studio/__tests__/fixture"
import { describe, expect, it } from "vitest"

import { AT, run, shot, started, take } from "./fixture"

describe("a primer's cut list", () => {
  it("is a card per cut, as long as its target, voiced as the plan says", () => {
    const cutList = cutListOf(primer())
    expect(
      cutList.shots.map((each) => [
        each.id,
        each.cut,
        each.picture.kind,
        each.durationMs,
        each.voice,
      ])
    ).toEqual([
      ["path", "path", "card", 20_000, "ad-lib"],
      ["miss", "miss", "card", 15_000, "read"],
      ["next", "next", "card", 10_000, "ad-lib"],
    ])
    expect(parseCutList({ ...cutList, revisions: [], notes: [] }).ok).toBe(true)
  })
})

describe("a scene's length", () => {
  it("follows its take: the take's start, the take, and a breath", () => {
    const scene = shot("a")
    expect(lengthFor(scene, 4_000)).toBe(200 + 4_000 + TAIL_MS)
    expect(lengthFor(scene, 3_999.6)).toBe(200 + 4_000 + TAIL_MS)
  })

  it("never cuts off a moment the scene pins", () => {
    const scene = {
      ...shot("a"),
      overrides: { cues: [{ sound: "pop" as const, atMs: 9_000 }] },
    }
    expect(lengthFor(scene, 1_000)).toBe(9_001)
  })

  it("is written into the cut list with the take's file", () => {
    const state = started()
    const cutList = fitted(state.project.revisions[0]!.cutList, "b", {
      id: "t1",
      shot: "b",
      mimeType: "audio/webm;codecs=opus",
      durationMs: 1_800,
    })
    expect(cutList.shots[1]).toMatchObject({
      durationMs: 2_500,
      take: { file: "b-t1.webm", inMs: 0, outMs: 1_800 },
    })
    expect(cutList.shots[0]).toEqual(
      state.project.revisions[0]!.cutList.shots[0]
    )
  })
})

describe("where a sitting opens", () => {
  it("is where the last one closed, while that scene is there", () => {
    const state = run(
      started(),
      { type: "sittingOpened", id: "s1", at: AT },
      { type: "sittingClosed", at: AT, done: "", next: "", shot: "c" }
    )
    expect(resumeAt(state.project)).toBe("c")
  })

  it("after a sitting that never closed, is the last take's scene", () => {
    const state = run(
      started(),
      { type: "sittingOpened", id: "s1", at: AT },
      { type: "takeStarted", shot: "b" },
      take("t1", "b")
    )
    expect(resumeAt(state.project)).toBe("b")
  })

  it("with nothing recorded, is the first scene", () => {
    expect(resumeAt(started().project)).toBe("a")
  })
})

describe("a take's cap", () => {
  it("is the budget less every other scene's chosen take", () => {
    const cutList = cutListOf(primer())
    const state = run(
      {
        ...started(),
        project: {
          ...started().project,
          revisions: [
            {
              rev: 1,
              author: "claude",
              message: "m",
              at: AT,
              cutList,
              primer: primer(),
            },
          ],
        },
      },
      { type: "takeStarted", shot: "path" },
      take("t1", "path")
    )
    expect(capFor(state.project, "miss")).toBe(120_000 - 1_800)
    expect(capFor(state.project, "path")).toBe(120_000)
  })
})

describe("the project the Studio opens on", () => {
  it("is the one worked on last", () => {
    const older = started().project
    const newer = run(started(), {
      type: "sittingOpened",
      id: "s1",
      at: "2026-10-31T09:00:00.000Z",
    }).project
    expect(currentOf([{ ...newer, id: "p2" }, older])?.id).toBe("p2")
    expect(currentOf([])).toBeNull()
  })

  it("is named for its title and when it was opened", () => {
    expect(projectIdFor("Playoff Delta, week 8!", AT)).toBe(
      "playoff-delta-week-8-20261030T090000000Z"
    )
    expect(projectIdFor("세 번째", AT)).toBe("video-20261030T090000000Z")
    const fitsTheFile = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
    expect(projectIdFor("x".repeat(90), AT)).toMatch(fitsTheFile)
    expect(cutListAt(started().project, 1)).not.toBeNull()
  })
})

describe("an episode (SHOW SH3)", () => {
  const opened = (): ReturnType<typeof projectFromEpisode> => {
    const text = episodeText()
    const episode = parseEpisode(JSON.parse(text))
    if (!episode.ok) throw new Error(episode.problems.join("; "))
    return projectFromEpisode("e1", episode.value, primerOf(text), AT)
  }

  it("opens over its clips, in its show's series, pinned", () => {
    const { project } = opened()
    const { cutList } = project.revisions[0] ?? {}
    expect(cutList?.series).toEqual({ id: "weekly", version: 1 })
    expect(cutList?.shots.map((each) => each.picture.kind)).toEqual([
      "capture",
      "capture",
    ])
    expect(project.episode).toMatchObject({
      show: "Weekly",
      format: { id: "weekly", version: 1 },
      period: "week 3",
    })
    expect(readProjectFile(projectFile(project)).ok).toBe(true)
  })

  it("takes a take and keeps its format, and refuses to leave it", () => {
    const state = run(
      opened(),
      { type: "takeStarted", shot: "open" },
      take("t1", "open")
    )
    const { cutList } = latest(state.project)
    const fit = fitted(cutList, "open", {
      id: "t1",
      shot: "open",
      mimeType: "audio/webm",
      durationMs: 9_000,
    })
    const revised = (shape: CutListShape): ProjectEvent => ({
      type: "revised",
      author: "claude",
      message: "A change",
      at: AT,
      cutList: shape,
    })
    expect(step(state, revised(fit)).refused).toBeNull()
    const leaving = [
      { ...cutList, shots: cutList.shots.slice(1) },
      { ...cutList, shots: [...cutList.shots].reverse() },
      { ...cutList, look: "lively" as const },
      { ...cutList, voice: "read" as const },
      { ...cutList, series: { id: "build-journal-short", version: 1 } },
    ]
    for (const shape of leaving)
      expect(step(state, revised(shape)).refused).toBe("notInFormat")
    // A file holding such a version is not one the phone opens.
    const forced = {
      ...state.project,
      revisions: [
        ...state.project.revisions,
        {
          rev: 3,
          author: "claude" as const,
          message: "A change",
          at: AT,
          cutList: leaving[0] ?? cutList,
        },
      ],
    }
    expect(readProjectFile(projectFile(forced)).ok).toBe(false)
  })
})

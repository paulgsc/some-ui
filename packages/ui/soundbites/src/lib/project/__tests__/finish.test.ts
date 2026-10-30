/** @vitest-environment node */
import { finishOf, youtubeLink } from "@soundbites/lib/project/finish"
import type { ProjectState } from "@soundbites/lib/project/model"
import { isAppendOnly, step } from "@soundbites/lib/project/model"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

const LINK = "https://youtu.be/dQw4w9WgXcQ"

/** Every scene of `state` taken, in order. */
function taken(state: ProjectState): ProjectState {
  return ["a", "b", "c"].reduce(
    (at, id) => run(at, { type: "takeStarted", shot: id }, take(`t-${id}`, id)),
    state
  )
}

const marked = (state: ProjectState, rev = 1): ProjectState =>
  run(state, { type: "markedReady", rev, at: AT })

describe("Finish's ready rule", () => {
  it("names the first scene with no kept take", () => {
    const state = run(
      started(),
      { type: "takeStarted", shot: "a" },
      take("t-a", "a")
    )
    expect(finishOf(state.project)).toEqual({
      kind: "take",
      rev: 1,
      shot: "b",
      n: 2,
    })
  })

  it("names an open note before any scene, and is ready again once it is settled", () => {
    const noted = run(marked(taken(started())), {
      type: "noted",
      note: {
        id: "n1",
        rev: 1,
        shot: "b",
        offsetMs: 500,
        author: "owner",
        text: "Louder here",
      },
    })
    expect(finishOf(noted.project)).toMatchObject({
      kind: "note",
      note: { id: "n1" },
    })
    const settled = run(noted, {
      type: "noteSettled",
      id: "n1",
      status: "applied",
    })
    expect(finishOf(settled.project)).toEqual({ kind: "ready", rev: 1 })
  })

  it("waits on the owner's mark once nothing else is missing", () => {
    const state = taken(started())
    expect(finishOf(state.project)).toEqual({ kind: "unmarked", rev: 1 })
    expect(finishOf(marked(state).project)).toEqual({ kind: "ready", rev: 1 })
  })

  it("refuses a mark while something is missing, or on an older revision", () => {
    expect(
      step(started(), { type: "markedReady", rev: 1, at: AT }).refused
    ).toBe("notReady")
    const later = run(taken(started()), {
      type: "revised",
      author: "owner",
      message: "Calmer",
      at: AT,
      cutList: shape([shot("a"), shot("b"), shot("c")]),
    })
    expect(step(later, { type: "markedReady", rev: 1, at: AT }).refused).toBe(
      "notLatest"
    )
  })
})

describe("a release", () => {
  it("keeps the pasted link on a revision marked ready, once", () => {
    const ready = marked(taken(started()))
    expect(
      step(taken(started()), { type: "released", rev: 1, url: LINK, at: AT })
        .refused
    ).toBe("notReady")
    const released = run(ready, {
      type: "released",
      rev: 1,
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      at: AT,
    })
    expect(finishOf(released.project)).toEqual({
      kind: "released",
      rev: 1,
      url: LINK,
    })
    expect(
      step(released, { type: "released", rev: 1, url: LINK, at: AT }).refused
    ).toBe("duplicate")
  })

  it("is never edited: its revision takes no note, and a change makes the next one", () => {
    const released = run(marked(taken(started())), {
      type: "released",
      rev: 1,
      url: LINK,
      at: AT,
    })
    const note = {
      id: "n1",
      rev: 1,
      shot: "a",
      offsetMs: 0,
      author: "owner" as const,
      text: "Too quiet",
    }
    expect(step(released, { type: "noted", note }).refused).toBe("released")
    const next = run(released, {
      type: "revised",
      author: "owner",
      message: "Louder",
      at: AT,
      cutList: shape([shot("a"), shot("b"), shot("c")]),
    })
    expect(finishOf(next.project)).toEqual({ kind: "unmarked", rev: 2 })
    expect(next.project.released).toEqual(released.project.released)
    expect(
      isAppendOnly(released.project, { ...next.project, released: [] })
    ).toBe(false)
  })

  it("is refused for anything but a YouTube video's link", () => {
    expect(
      step(marked(taken(started())), {
        type: "released",
        rev: 1,
        url: "https://example.com/watch?v=dQw4w9WgXcQ",
        at: AT,
      }).refused
    ).toBe("noLink")
  })
})

describe("youtubeLink", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", LINK],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", LINK],
    [" https://youtube.com/shorts/dQw4w9WgXcQ ", LINK],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", LINK],
    ["http://youtu.be/dQw4w9WgXcQ", null],
    ["https://youtu.be/short", null],
    ["https://youtube.com/channel/UC123", null],
    ["not a link", null],
  ])("reads %j as %j", (text, link) => {
    expect(youtubeLink(text)).toBe(link)
  })
})

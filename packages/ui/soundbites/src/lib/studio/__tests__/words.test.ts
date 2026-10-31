/** @vitest-environment node */
import { newProject } from "@soundbites/lib/project/model"
import { cutListOf } from "@soundbites/lib/project/script"
import { startView } from "@soundbites/lib/studio/view"
import { seconds, STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { describe, expect, it } from "vitest"

import { AT, primer } from "./fixture"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), with Studio's own machinery.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue|retry|null|undefined|indexeddb|database|store|blob|shot|cut list|revision|rev|keeper|pending|write|refused)\b/i

/**
 * What a word maker is handed to make one: a title, a count, a length, a
 * sitting's log, a scene, a look and voice, what the phone kept. A maker
 * refusing every sample (not a string, or a throw) is reached by none of
 * them, and the walk below fails on it rather than passing without it.
 */
const SAMPLES: ReadonlyArray<ReadonlyArray<unknown>> = [
  ["Playoff Delta, week 8"],
  ["Playoff Delta, week 8", 2, 3],
  ["Playoff Delta, week 8", { scenes: [2], plans: false }],
  [2],
  [2, 3],
  [4_700, 120_000],
  [null],
  [{ done: "Kept takes for scene 1.", next: "Scene 2: The miss." }],
  [{ n: 2, artifact: "The miss" }],
  [[1, 2]],
  [{ scenes: [2, 5], plans: false }],
  ["calm", "ad-lib"],
  ["denied"],
]

/** A word a sample did not fit shows the misfit; no screen shows that. */
const MISFIT = /\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/
const fits = (made: string): boolean => !MISFIT.test(made)

type Walk = { words: Array<string>; unreached: Array<string> }

/**
 * Every word in the table: each fixed one, and each one a maker makes from
 * every sample it takes, so a maker added to the table is walked without
 * being listed here.
 */
function walk(table: unknown, path = "words"): Walk {
  if (typeof table === "string") return { words: [table], unreached: [] }
  if (typeof table === "function") {
    const words = SAMPLES.flatMap((args) => {
      try {
        const made: unknown = Reflect.apply(table, undefined, [...args])
        return typeof made === "string" && fits(made) ? [made] : []
      } catch {
        // Ignored: a sample the maker does not take; another may.
        return []
      }
    })
    return { words, unreached: words.length === 0 ? [path] : [] }
  }
  if (typeof table === "object" && table !== null)
    return Object.entries(table)
      .map(([key, value]) => walk(value, `${path}.${key}`))
      .reduce(
        (sum, each) => ({
          words: [...sum.words, ...each.words],
          unreached: [...sum.unreached, ...each.unreached],
        }),
        { words: [], unreached: [] }
      )
  return { words: [], unreached: [] }
}

/** Every string Start draws for a video just opened from its primer. */
function startDrawn(): Array<string> {
  const { project } = newProject("week-8", {
    author: "claude",
    message: "Primer",
    at: AT,
    cutList: cutListOf(primer()),
    primer: primer(),
  })
  const view = startView(project)
  return [view.title, view.standing, ...view.sittings.map((row) => row.status)]
}

describe("Studio's words", () => {
  const walked = walk(STUDIO_WORDS)
  const all = [...walked.words, ...startDrawn()]

  it("are many, and every maker was reached by a sample", () => {
    expect(all.length).toBeGreaterThan(40)
    expect(walked.unreached).toEqual([])
  })

  it("never name the machinery", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("SW1: name what you do or what Claude made, never a file, folder or format", () => {
    const file =
      /\.json|›|build journal|\bprimers?\b|\bfiles?\b|\bfolder\b|\bformat\b/i
    expect(all.filter((text) => file.test(text))).toEqual([])
  })

  it("write a length as a number of seconds", () => {
    expect(seconds(4_700)).toBe("4.7 s")
    expect(STUDIO_WORDS.record.runsWith(5_200)).toBe(
      "This scene runs 5.2 s: your take and a breath"
    )
  })

  it("leave a sitting's log in lines the next sitting reads", () => {
    expect(STUDIO_WORDS.sittingDone([])).toBe("No takes this sitting.")
    expect(STUDIO_WORDS.sittingDone([2])).toBe("Kept takes for scene 2.")
    expect(STUDIO_WORDS.sittingDone([1, 2, 4])).toBe(
      "Kept takes for scenes 1, 2 and 4."
    )
    expect(STUDIO_WORDS.sittingNext({ n: 3, artifact: "End card" })).toBe(
      "Scene 3: End card."
    )
    expect(
      STUDIO_WORDS.standing({
        done: "Kept takes for scene 2.",
        next: "Scene 3: End card.",
      })
    ).toBe("Last time: Kept takes for scene 2. Next: Scene 3: End card.")
  })

  it("say what to do when the phone is full", () => {
    const full = STUDIO_WORDS.notice.full
    expect(full).toMatch(/wasn't kept/)
    expect(full).toMatch(/share a video's takes with Claude/)
    expect(full).toMatch(/the room they held is free/)
  })

  it("never say takes were kept where a sitting wasn't saved", () => {
    expect(STUDIO_WORDS.done.notSaved).not.toMatch(/takes are kept/)
  })
})

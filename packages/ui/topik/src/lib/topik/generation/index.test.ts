import { FEELING_KEYS } from "@some-ui/styles/theme"
import type { LastDrama } from "@topik/lib/topik/core/last-drama"
import { describe, expect, it } from "vitest"

import {
  buildLessonPrompt,
  buildTreePrompt,
  lastDramaText,
  LESSON_PROMPT,
  nextSceneFile,
} from "."

const record = (extra: Partial<LastDrama> = {}): LastDrama => ({
  lessonId: "first-dinner",
  content: "x",
  level: 2,
  title: "회장님 댁 거실",
  at: 1,
  scenes: [
    { id: "s0", place: "회장님 댁 거실", feeling: "tension" },
    { id: "s1", place: "부엌", feeling: "chill" },
  ],
  tries: [
    {
      choice: "c1",
      prompt: "서연은 뭐라고 대답할까?",
      chosen: "응, 마실래.",
      answered: false,
    },
  ],
  ...extra,
})

describe("lastDramaText", () => {
  it("describes the drama in words: scenes, first tries, then the review", () => {
    expect(
      lastDramaText(
        record({
          review: {
            enjoyed: "loved",
            korean: "easier",
            more: ["s1"],
            next: "more revenge",
          },
        })
      )
    ).toBe(
      [
        '"회장님 댁 거실", level 2.',
        "Scenes reached: 회장님 댁 거실 (tension), 부엌 (chill).",
        "First tries:",
        '- 서연은 뭐라고 대답할까? -> "응, 마실래.": missed it.',
        'Review: loved it; the Korean next time: easier to follow; more of: 부엌 (chill); what next: "more revenge".',
      ].join("\n")
    )
  })

  it("says the review was skipped, so the first tries steer alone", () => {
    expect(lastDramaText(record({ tries: [] }))).toBe(
      [
        '"회장님 댁 거실", level 2.',
        "Scenes reached: 회장님 댁 거실 (tension), 부엌 (chill).",
        "Review: none - they skipped it.",
      ].join("\n")
    )
  })
})

describe("buildLessonPrompt", () => {
  it("appends the request to the self-contained prompt", () => {
    const prompt = buildLessonPrompt({
      level: 2,
      scene: "the fiancée meets his mother",
    })
    expect(prompt.startsWith(LESSON_PROMPT.trimEnd())).toBe(true)
    expect(prompt).toContain(
      [
        "## This request",
        "",
        "Level: 2",
        "Scene: the fiancée meets his mother",
        "Conversations: 3",
        "",
      ].join("\n")
    )
  })

  it("lets the model invent a scene", () => {
    expect(buildLessonPrompt({ level: 1, scene: "  " })).toContain(
      "Scene: (invent one)"
    )
  })

  it("ships a prompt that points at nothing outside itself", () => {
    // The learner pastes it into any model; the repo is not there.
    expect(LESSON_PROMPT).not.toMatch(/packages\/|pnpm |canon |cargo /)
    expect(LESSON_PROMPT).toContain("## Output")
  })
})

describe("buildTreePrompt", () => {
  it("lists the app's feeling keys in place of the marker, and appends the request", () => {
    const prompt = buildTreePrompt({
      level: 3,
      scene: "the gift goes wrong",
      audience: "batch",
    })
    expect(prompt).not.toContain("<!-- feelings -->")
    for (const key of FEELING_KEYS) {
      expect(prompt).toContain(`| \`${key}\` |`)
    }
    expect(prompt).toContain(
      "## This request\n\nLevel: 3\nScene: the gift goes wrong\n"
    )
    expect(prompt).not.toContain("Conversations:")
    expect(prompt).toContain(
      "Last drama: none - this drama joins the batch every learner at this level chooses from."
    )
  })

  it("asks for the genres picked, or says the default", () => {
    expect(
      buildTreePrompt({ level: 2, genres: ["revenge", " ", "office romance"] })
    ).toContain("Genre: revenge, office romance\n")
    expect(buildTreePrompt({ level: 2 })).toContain(
      "Genre: (the default: a makjang family romcom)"
    )
  })

  it("carries the learner's last drama, or says this is their first", () => {
    expect(
      buildTreePrompt({ level: 2, lastDrama: lastDramaText(record()) })
    ).toContain('Last drama:\n"회장님 댁 거실", level 2.\n')
    expect(buildTreePrompt({ level: 2 })).toContain(
      "Last drama: none yet - this is their first."
    )
  })

  it("ships a prompt that points at nothing outside itself", () => {
    const prompt = buildTreePrompt({ level: 1 })
    expect(prompt).not.toMatch(/packages\/|pnpm |canon |cargo /)
  })
})

describe("nextSceneFile", () => {
  it("names the export by its moment, and tells an agent the reply's name", () => {
    const file = nextSceneFile(
      "THE PROMPT",
      new Date("2026-10-09T07:05:03.120Z")
    )
    expect(file.name).toBe("drama-20261009T070503120Z.prompt.md")
    expect(file.text).toContain("`drama-20261009T070503120Z.json`")
    expect(file.text.endsWith("\nTHE PROMPT")).toBe(true)
  })
})

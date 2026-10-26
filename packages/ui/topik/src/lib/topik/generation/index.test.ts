import { FEELING_KEYS } from "@some-ui/styles/theme"
import { FIGURE_KEYS } from "@topik/lib/topik/core/cast"
import type { LastDrama } from "@topik/lib/topik/core/last-drama"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  buildLessonPrompt,
  buildTreePrompt,
  lastDramaText,
  LESSON_PROMPT,
  nextSceneFile,
  voiceNoteName,
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
          hook: "회장님은 태준에게 말할까?",
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
        'It stopped on: "회장님은 태준에게 말할까?"',
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
  it("lists the app's figure and feeling keys in place of their markers, and appends the request", () => {
    const prompt = buildTreePrompt({
      level: 3,
      scene: "the gift goes wrong",
      audience: "batch",
    })
    expect(prompt).not.toContain("<!-- feelings -->")
    expect(prompt).not.toContain("<!-- figures -->")
    for (const key of [...FEELING_KEYS, ...FIGURE_KEYS]) {
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

  it("asks for the genres picked, or says none were", () => {
    expect(
      buildTreePrompt({ level: 2, genres: ["revenge", "office romance"] })
    ).toContain("Genre: revenge, office romance\n")
    expect(buildTreePrompt({ level: 2 })).toContain("Genre: (none picked)")
  })

  it("names the voice notes a spoken scene came in, and nothing when it was typed", () => {
    const at = new Date("2026-10-09T07:05:03.120Z")
    const notes = [
      voiceNoteName(at, 0, "audio/webm;codecs=opus"),
      voiceNoteName(at, 1, "audio/mp4"),
    ]
    expect(notes[1]).toMatch(/^drama-20261009T070503120Z\.voice-2\./)
    expect(buildTreePrompt({ level: 2, voiceNotes: notes })).toContain(
      `Scene, spoken: ${notes.join(", ")}\n`
    )
    expect(buildTreePrompt({ level: 2, voiceNotes: [] })).not.toContain(
      "\nScene, spoken:"
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

/** The export's `notes` line; empty when it has none. */
const notesLine = (text: string): string =>
  text.split("\n").find((line) => line.startsWith("<!-- notes: ")) ?? ""

/** The map a `notes` line holds, as the routine reads it. */
const idsOf = (line: string): Record<string, string> =>
  z
    .record(z.string(), z.string())
    .parse(JSON.parse(line.slice("<!-- notes: ".length, -" -->".length)))

describe("nextSceneFile", () => {
  it("names the export by its moment, and tells an agent the reply's name", () => {
    const file = nextSceneFile(
      "THE PROMPT",
      new Date("2026-10-09T07:05:03.120Z")
    )
    expect(file.name).toBe("drama-20261009T070503120Z.prompt.md")
    expect(file.stamp).toBe("drama-20261009T070503120Z")
    expect(file.at).toBe("2026-10-09T07:05:03.120Z")
    expect(file.text).toContain("`drama-20261009T070503120Z.json`")
    expect(file.text.endsWith("\nTHE PROMPT")).toBe(true)
  })

  it("names each voice note's id by its file name, in the order they were said", () => {
    const at = new Date("2026-10-09T07:05:03.120Z")
    const first = { id: "said-first", name: voiceNoteName(at, 0, "audio/mp4") }
    const second = {
      id: "said-second",
      name: voiceNoteName(at, 1, "audio/webm;codecs=opus"),
    }
    const file = nextSceneFile("THE PROMPT", at, [first, second])
    const line = notesLine(file.text)
    expect(line).toMatch(/^<!-- notes: \{.*\} -->$/)
    const ids = idsOf(line)
    expect(ids).toEqual({
      [first.name]: "said-first",
      [second.name]: "said-second",
    })
    // The routine reads them in this order, which `voice-<n>` also gives.
    expect(Object.keys(ids)).toEqual([first.name, second.name])
    expect(first.name).toMatch(/\.voice-1\./)
    expect(second.name).toMatch(/\.voice-2\./)
    expect(file.text.endsWith(`${line}\n\nTHE PROMPT`)).toBe(true)
  })

  it("keeps the line a comment whatever an id holds", () => {
    const at = new Date("2026-10-09T07:05:03.120Z")
    const file = nextSceneFile("THE PROMPT", at, [
      { id: "x--><b>", name: voiceNoteName(at, 0, "audio/mp4") },
    ])
    const line = notesLine(file.text)
    expect(line.indexOf("-->")).toBe(line.length - "-->".length)
    expect(idsOf(line)).toEqual({
      [voiceNoteName(at, 0, "audio/mp4")]: "x--><b>",
    })
  })

  it("names no ids for a typed scene, as every export from before them reads", () => {
    const at = new Date("2026-10-09T07:05:03.120Z")
    const file = nextSceneFile("THE PROMPT", at, [])
    expect(file.text).not.toContain("<!-- notes:")
    expect(file).toEqual(nextSceneFile("THE PROMPT", at))
    expect(file.text.split("\n").slice(1)).toEqual(["", "THE PROMPT"])
  })
})

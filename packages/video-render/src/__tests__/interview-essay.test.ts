/**
 * The interview essay (IW6, #2937): its format is one, refusing a newer
 * version; the sample parses and says its scenes in order, a group per question and per
 * read, a silence skipping its faults; the owner's bubble is lit only over a
 * take; an essay that contradicts itself is refused with every reason; and
 * the takes folder is read as home exports it.
 */
import { parseCutList } from "@video-render/cut-list"
import { parseFormat } from "@video-render/format"
import {
  INTERVIEW_ESSAY_ID,
  INTERVIEW_ESSAY_VERSION,
  interviewEssayChapterMarks,
  interviewEssayCutList,
  interviewEssayFormat,
  interviewEssayScenes,
  interviewEssayTakeFiles,
  interviewTakeOf,
  OPENING_TAKE,
  parseInterviewEssay,
  sampleInterviewEssay,
} from "@video-render/interview-essay"
import type { InterviewEssay } from "@video-render/interview-essay"
import { UNHEARD_SAID } from "@video-render/verdict"
import { describe, expect, it } from "vitest"

function sample(): InterviewEssay {
  const parsed = sampleInterviewEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

const problems = (raw: unknown): ReadonlyArray<string> => {
  const parsed = parseInterviewEssay(raw)
  return parsed.ok ? [] : parsed.problems
}

describe("the interview essay's format", () => {
  it("is a format, and refuses a version newer than the newest (VS1)", () => {
    expect(parseFormat(interviewEssayFormat()).ok).toBe(true)
    expect(() => interviewEssayFormat(INTERVIEW_ESSAY_VERSION + 1)).toThrow()
  })

  it("refuses an essay for a newer template (VS1)", () => {
    expect(
      problems({
        ...sample(),
        template: {
          id: INTERVIEW_ESSAY_ID,
          version: INTERVIEW_ESSAY_VERSION + 1,
        },
      })
    ).toEqual([
      `template.version: newer than this build knows: it draws up to version ${String(INTERVIEW_ESSAY_VERSION)}, so publish a newer stage first`,
    ])
  })
})

describe("the sample essay", () => {
  it("says its scenes in order, a silence skipping its faults", () => {
    expect(interviewEssayScenes(sample()).map((s) => s.id)).toEqual([
      "intro",
      "brand-in",
      "open",
      "chapter-question-1",
      "question-1",
      "answer-1",
      "faults-1",
      "model-1",
      "beside-1",
      "chapter-question-2",
      "question-2",
      "answer-2",
      "model-2",
      "beside-2",
      "chapter-card-1",
      "card-1",
      "reading-1",
      "heard-1",
      "chapter-card-2",
      "card-2",
      "reading-2",
      "chapter-weeks",
      "weeks",
      "next",
      "brand-out",
    ])
  })

  it("lights the owner only over a take, and plays each take by its name in the folder", () => {
    const scenes = interviewEssayScenes(sample())
    expect(scenes.filter((s) => s.speaker === "you").map((s) => s.id)).toEqual([
      "answer-1",
      "reading-1",
    ])
    expect(scenes.map(interviewTakeOf).filter((t) => t !== null)).toEqual([
      "a-time-you",
      "read.keep-it-first",
    ])
  })

  it("makes a cut list, with a chapter for each question, read and the close", () => {
    const essay = sample()
    const scenes = interviewEssayScenes(essay)
    expect(
      parseCutList(
        interviewEssayCutList(
          essay,
          scenes.map(() => null)
        )
      ).ok
    ).toBe(true)
    expect(interviewEssayChapterMarks(essay).map((m) => m.title)).toEqual([
      "Question 1 of 2",
      "Question 2 of 2",
      "Read 1 of 2",
      "Read 2 of 2",
      "Over the weeks",
    ])
  })
})

describe("an essay that contradicts itself", () => {
  it("is refused with every reason", () => {
    const essay = sample()
    const [first, second] = essay.questions
    const [read] = essay.reads
    if (
      first?.answer.kind !== "take" ||
      second === undefined ||
      read?.answer.kind !== "take"
    )
      throw new Error("the sample changed")
    expect(
      problems({
        ...essay,
        week: { ...essay.week, to: "2026-11-01" },
        questions: [
          {
            ...first,
            answer: { ...first.answer, marks: first.answer.marks.slice(1) },
          },
          { ...second, id: first.id },
        ],
        reads: [
          {
            ...read,
            answer: {
              ...read.answer,
              faults: [
                { by: "judged", what: "Stiff", shows: "It", quote: "Every" },
              ],
            },
          },
        ],
        weeks: {
          ...essay.weeks,
          weeks: ["2026-w46", "2026-w45"],
          rows: [{ name: "Fillers", of: "answers", cells: [1] }],
        },
        next: { ...essay.next, week: "2026-w46" },
      })
    ).toEqual([
      "week: it ends before it starts",
      "questions: two share an id",
      "a-time-you: its answer marks 2 guidelines, and it has 3",
      "keep-it-first: a read's faults are measured, never judged",
      "weeks: the chart doesn't end on 2026-w47",
      "weeks: they aren't oldest first, each once",
      "Fillers: it has 1 cells for 2 weeks",
      "next: 2026-w46 doesn't come after 2026-w47",
    ])
  })
})

describe("the takes folder", () => {
  const essay = sample()

  it("holds a take for each answered question and read", () => {
    expect(
      interviewEssayTakeFiles(essay, [
        "a-time-you.m4a",
        "a-time-you.words.json",
        "read.keep-it-first.webm",
      ])
    ).toEqual({
      ok: true,
      value: {
        "a-time-you": {
          audio: "a-time-you.m4a",
          words: "a-time-you.words.json",
        },
        "read.keep-it-first": {
          audio: "read.keep-it-first.webm",
          words: null,
        },
      },
    })
  })

  it("names a read's take by its card, so a silent read's take is refused", () => {
    const refused = interviewEssayTakeFiles(essay, [
      "a-time-you.m4a",
      "read.keep-it-first.webm",
      "read.one-surface-each.m4a",
    ])
    expect(refused.ok ? [] : refused.problems).toEqual([
      "read.one-surface-each.m4a: read.one-surface-each was left silent",
    ])
  })
})

describe("a read home couldn't make out (HEARD2; EH1)", () => {
  const essay = sample()
  const unheard: InterviewEssay = {
    ...essay,
    reads: essay.reads.map((read) =>
      read.id === "keep-it-first"
        ? { ...read, answer: { kind: "silence", unheard: true } }
        : read
    ),
  }

  it("parses, and is said in code's words by the tutor", () => {
    expect(problems(unheard)).toEqual([])
    const reading = interviewEssayScenes(unheard).find(
      (scene) => scene.section === "reading" && scene.read === "keep-it-first"
    )
    expect(reading).toMatchObject({ speaker: "tutor", said: UNHEARD_SAID })
  })

  it("has its take set aside, unplayed, when home hands it over", () => {
    expect(
      interviewEssayTakeFiles(unheard, [
        "a-time-you.m4a",
        "read.keep-it-first.webm",
        "read.keep-it-first.words.json",
      ])
    ).toEqual({
      ok: true,
      value: { "a-time-you": { audio: "a-time-you.m4a", words: null } },
    })
  })
})

describe("the essay's opening in the owner's voice (IW10)", () => {
  const essay = sample()
  const opened: InterviewEssay = {
    ...essay,
    template: { id: INTERVIEW_ESSAY_ID, version: 2 },
    opening: {
      transcript: "I'm paulgsc. This week I practise telling a decision.",
    },
  }

  it("plays the owner's take first after the brand, and leaves an essay without one as it was", () => {
    expect(problems(opened)).toEqual([])
    // A version-1 essay, from before the opening, holds none, and its format draws none.
    expect(
      problems({ ...opened, template: { ...essay.template, version: 1 } })
    ).toEqual([
      "opening: the template draws the owner's opening from version 2",
    ])
    expect(interviewEssayFormat(1).scenes.map((s) => s.id)).not.toContain(
      "opening"
    )
    expect(interviewEssayFormat(2).scenes.map((s) => s.id)[0]).toBe("opening")
    const scenes = interviewEssayScenes(opened)
    expect(scenes.map((s) => s.id).slice(0, 4)).toEqual([
      "intro",
      "brand-in",
      "opening",
      "open",
    ])
    expect(scenes[2]).toMatchObject({
      speaker: "you",
      said: opened.opening?.transcript,
    })
    expect(interviewTakeOf(scenes[2]!)).toBe(`read.${OPENING_TAKE}`)
    expect(interviewEssayScenes(essay).map((s) => s.id)).not.toContain(
      "opening"
    )
  })

  it("holds the opening's take when it plays, and sets it aside when it doesn't", () => {
    const names = [
      "a-time-you.m4a",
      "read.keep-it-first.webm",
      "read.opening.m4a",
    ]
    const held = interviewEssayTakeFiles(opened, names)
    expect(held.ok && held.value["read.opening"]).toEqual({
      audio: "read.opening.m4a",
      words: null,
    })
    const aside = interviewEssayTakeFiles(essay, names)
    expect(aside.ok && Object.keys(aside.value).sort()).toEqual([
      "a-time-you",
      "read.keep-it-first",
    ])
    const missing = interviewEssayTakeFiles(opened, names.slice(0, 2))
    expect(missing.ok ? [] : missing.problems).toEqual([
      "read.opening: answered, and there is no take of it",
    ])
  })
})

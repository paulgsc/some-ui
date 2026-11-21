/**
 * The voice policy (#3321, C840), over every kind of video essay. Each kind
 * is a case of `KINDS`, keyed by `VideoKind`: a kind named there is a
 * compile error here until it says how its lines are voiced (a new essay
 * kind in src is added to `VideoKind` by hand). In the lanes, each kind's newest
 * version pins: one voice per speaker within a chapter, a change at each
 * chapter boundary, and the asker and the answerer of an exchange never in
 * the same voice. Every version before the lanes keeps the voices it had,
 * so a published essay's takes are the same bytes.
 */
import { join } from "node:path"
import {
  CALL_VOICES,
  callScenes,
  callVoices,
  sampleCallWeek,
} from "@video-render/call"
import {
  CARDS_VOICES,
  cardsChapterMarks,
  cardsScenes,
} from "@video-render/cards-essay"
import type { Parsed } from "@video-render/cut-list"
import {
  ESSAY_CAST_VERSION,
  ESSAY_VERSION,
  ESSAY_VOICES,
  essayChapterMarks,
  essayFormat,
  essayScenes,
  essaySceneVoices,
  parseEssay,
  sampleEssay,
} from "@video-render/essay"
import type { Essay, Speaker } from "@video-render/essay"
import {
  INTERVIEW_ESSAY_VERSION,
  interviewEssayFormat,
  interviewEssayScenes,
  sampleInterviewEssay,
} from "@video-render/interview-essay"
import { readSeries } from "@video-render/node"
import { sampleSpokenCard } from "@video-render/spoken-card"
import {
  chapterIndexes,
  KOKORO_VOICES,
  speakerTurns,
  VOICE_LANES,
  VOICE_ROLES,
  voiceOf,
  voicePolicyOf,
} from "@video-render/voices"
import type { KokoroVoice, VoicesId } from "@video-render/voices"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const SERIES = join(import.meta.dirname, "../sample/series/cheat-sheet")

/** A line as a kind says it: who, in which chapter, in which voice. */
type Voiced = {
  readonly speaker: string
  readonly chapter: number
  readonly voice: KokoroVoice
  /** The exchange it belongs to, for a question or an answer. */
  readonly exchange?: string
}

/** Every kind of video essay whose lines Kokoro says. */
type VideoKind =
  | "call"
  | "cards"
  | "spoken-card"
  | "rust-essay"
  | "rust-opening"
  | "interview-essay"

type Case = {
  /** Whether its newest version is in the lanes; the call is `fixed` (C840). */
  readonly lanes: boolean
  /** Whether Kokoro says both sides of an exchange in it (the sample's opening). */
  readonly pairs: boolean
  /** Its speakers that hold one voice throughout: the owner's stand-in. */
  readonly held: ReadonlyArray<string>
  /** Its newest version's lines, voiced. */
  readonly lines: () => Promise<ReadonlyArray<Voiced>>
}

const unwrap = <T>(parsed: Parsed<T>): T => {
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
  return parsed.value
}

/** An opening of two exchanges, the owner answering each. */
const OPENING: NonNullable<Essay["opening"]> = {
  exchanges: [
    { n: 1, ask: "What is Rust Rounds?", transcript: "Mine.", take: "t-1" },
    { n: 2, ask: "Why watch?", transcript: "To see.", take: "t-2" },
  ],
}

/** The Rust sample at the newest version, opening on `opening` or on nothing. */
const rustEssay = (opening?: Essay["opening"]): Essay => {
  const { opening: _sample, ...essay } = unwrap(sampleEssay())
  return unwrap(
    parseEssay({
      ...essay,
      template: { ...essay.template, version: ESSAY_VERSION },
      ...(opening === undefined ? {} : { opening }),
    })
  )
}

/** An essay's scenes voiced as the recorder voices them. */
const essayLines = (
  scenes: ReadonlyArray<{
    readonly section: string
    readonly speaker: Speaker
    readonly exchange?: number
  }>,
  voices: ReadonlyArray<KokoroVoice>
): Array<Voiced> => {
  const chapters = chapterIndexes(scenes.map((s) => s.section === "chapter"))
  return scenes.map((scene, i) => ({
    speaker: scene.speaker,
    chapter: chapters[i] ?? 0,
    voice: voices[i] ?? "af_heart",
    ...(scene.exchange === undefined
      ? {}
      : { exchange: `opening-${String(scene.exchange)}` }),
  }))
}

/** A cards essay's scenes, voiced in `voices`, as their lines are. */
const cardsLines = async (
  video: string,
  voices: VoicesId | undefined
): Promise<Array<Voiced>> => {
  const cut = await showcase(video)
  const card = unwrap(sampleSpokenCard())
  const heard = new Map([["introduction", { ...card, card: "introduction" }]])
  const scenes = cardsScenes(cut, heard, voices)
  const chapters = chapterIndexes(scenes.map((s) => s.mark !== undefined))
  return scenes.flatMap((scene, i) => {
    const chapter = chapters[i] ?? 0
    const spoken = scene.spoken
    // An owner's turn is their own take, said in no voice of Kokoro's.
    if (spoken?.scene.take !== undefined) return []
    if (spoken !== undefined)
      return [
        {
          speaker: spoken.scene.role === "ask" ? "asker" : "tutor",
          chapter,
          voice: spoken.voice,
          exchange: `${spoken.card}-${String(spoken.scene.exchange)}`,
        },
      ]
    return scene.lines.map((line) => ({
      speaker: line.file.endsWith("-narration") ? "narrator" : "host",
      chapter,
      voice: line.voice,
    }))
  })
}

/** The newest cheat-sheet's voices, as the recorder reads them. */
const newestCardsVoices = async (): Promise<VoicesId | undefined> =>
  unwrap(await readSeries(SERIES, 4)).voices

const KINDS: Readonly<Record<VideoKind, Case>> = {
  call: {
    lanes: false,
    pairs: false,
    held: [],
    lines: () => {
      const week = unwrap(sampleCallWeek())
      const scenes = callScenes(week)
      const voices = callVoices(scenes)
      const chapters = chapterIndexes(
        scenes.map((s) => s.section === "chapter")
      )
      return Promise.resolve(
        scenes.map((scene, i) => ({
          speaker: scene.section,
          chapter: chapters[i] ?? 0,
          voice: voices[i] ?? "af_heart",
        }))
      )
    },
  },
  cards: {
    lanes: true,
    pairs: false,
    held: [],
    lines: async () => cardsLines("rust-scratchpad", await newestCardsVoices()),
  },
  "spoken-card": {
    lanes: true,
    pairs: false,
    held: [],
    lines: async () => cardsLines("spoken-intro", await newestCardsVoices()),
  },
  "rust-essay": {
    lanes: true,
    pairs: false,
    held: ["you"],
    lines: () => {
      const essay = rustEssay()
      const scenes = essayScenes(essay, "sample")
      const shape = essayFormat(essay.template.version).shape
      return Promise.resolve(
        essayLines(scenes, essaySceneVoices(shape, scenes))
      )
    },
  },
  "rust-opening": {
    lanes: true,
    pairs: true,
    held: ["you"],
    lines: () => {
      const essay = rustEssay(OPENING)
      const scenes = essayScenes(essay, "sample")
      const shape = essayFormat(essay.template.version).shape
      return Promise.resolve(
        essayLines(scenes, essaySceneVoices(shape, scenes))
      )
    },
  },
  "interview-essay": {
    lanes: true,
    pairs: false,
    held: ["you"],
    lines: () => {
      const essay = unwrap(sampleInterviewEssay())
      expect(essay.template.version).toBe(INTERVIEW_ESSAY_VERSION)
      const scenes = interviewEssayScenes(essay, "sample")
      const shape = interviewEssayFormat(essay.template.version).shape
      return Promise.resolve(
        essayLines(scenes, essaySceneVoices(shape, scenes))
      )
    },
  },
}

/** Each speaker's voices in each chapter. */
const byChapter = (
  lines: ReadonlyArray<Voiced>
): Map<string, Map<number, Set<KokoroVoice>>> => {
  const out = new Map<string, Map<number, Set<KokoroVoice>>>()
  for (const line of lines) {
    const chapters =
      out.get(line.speaker) ?? new Map<number, Set<KokoroVoice>>()
    const voices = chapters.get(line.chapter) ?? new Set<KokoroVoice>()
    voices.add(line.voice)
    chapters.set(line.chapter, voices)
    out.set(line.speaker, chapters)
  }
  return out
}

describe("the voice lanes", () => {
  it("are disjoint, each of two voices or more but the held answerer's, every one a voice home's speaker has", () => {
    for (const lanes of Object.values(VOICE_LANES)) {
      const all = VOICE_ROLES.flatMap((role) => lanes[role])
      expect(new Set(all).size).toBe(all.length)
      for (const role of VOICE_ROLES)
        expect(lanes[role].length).toBe(role === "answerer" ? 1 : 3)
      for (const voice of all) expect(KOKORO_VOICES).toContain(voice)
    }
  })

  it("move a speaker on once per chapter it speaks in, even after chapters it sat out", () => {
    // a speaks in chapters 0, 1 and 4; b in 2 and 3.
    const lines = [
      { speaker: "a", opens: false },
      { speaker: "a", opens: true },
      { speaker: "b", opens: true },
      { speaker: "b", opens: true },
      { speaker: "a", opens: true },
      { speaker: "a", opens: false },
    ] as const
    expect(speakerTurns(lines)).toEqual([0, 1, 0, 1, 2, 2])
  })

  it("give a role its lane's voices round robin by chapter", () => {
    const policy = voicePolicyOf<"t">(
      "lanes-v1",
      { t: "af_heart" },
      { t: "tutor" }
    )
    const [a, b, c] = VOICE_LANES["lanes-v1"].tutor
    expect(
      [0, 1, 2, 3, 4].map((chapter) => voiceOf(policy, "t", chapter))
    ).toEqual([a, b, c, a, b])
    expect(chapterIndexes([true, false, true, true, false])).toEqual([
      0, 0, 1, 2, 2,
    ])
  })
})

describe.each(Object.entries(KINDS))(
  "%s",
  (_kind, { lanes, pairs, held, lines }) => {
    it("says every line of a speaker in one voice within a chapter", async () => {
      for (const chapters of byChapter(await lines()).values())
        for (const voices of chapters.values()) expect(voices.size).toBe(1)
    })

    it("keeps an exchange's asker and answerer in two voices", async () => {
      const exchanges = new Map<string, Map<string, KokoroVoice>>()
      for (const line of await lines()) {
        if (line.exchange === undefined) continue
        const sides =
          exchanges.get(line.exchange) ?? new Map<string, KokoroVoice>()
        sides.set(line.speaker, line.voice)
        exchanges.set(line.exchange, sides)
      }
      for (const sides of exchanges.values())
        expect(new Set(sides.values()).size).toBe(sides.size)
      expect([...exchanges.values()].some((sides) => sides.size === 2)).toBe(
        pairs
      )
    })

    it.runIf(lanes)(
      "moves a speaker's voice on each time it speaks in a new chapter, but the owner's stand-in",
      async () => {
        const said = await lines()
        expect(new Set(said.map((l) => l.chapter)).size).toBeGreaterThan(1)
        let moved = 0
        for (const [speaker, chapters] of byChapter(said)) {
          const order = [...chapters.entries()].sort(([a], [b]) => a - b)
          for (const [i, [, voices]] of order.entries()) {
            const before = order[i - 1]
            if (before === undefined) continue
            if (held.includes(speaker))
              expect([...voices]).toEqual([...before[1]])
            else {
              expect([...voices]).not.toEqual([...before[1]])
              moved += 1
            }
          }
        }
        expect(moved).toBeGreaterThan(0)
      }
    )
  }
)

describe("in the lanes, as a listener hears them", () => {
  it("a cards essay's intro is the call's host, and each card has a narrator of its own", async () => {
    const voices = await newestCardsVoices()
    const scenes = cardsScenes(
      await showcase("rust-scratchpad"),
      new Map(),
      voices
    )
    // A chapter for each mark the upload lists, and one before them.
    const said = await cardsLines("rust-scratchpad", voices)
    expect(new Set(said.map((l) => l.chapter)).size).toBe(
      cardsChapterMarks(scenes).length + 1
    )
    expect(scenes.slice(0, 4).map((s) => s.lines.map((l) => l.voice))).toEqual([
      ["am_michael"],
      ["am_puck", "af_heart"],
      ["bf_isabella", "bf_emma"],
      ["am_michael", "af_nicole"],
    ])
  })

  it("a Rust essay's tutor moves on at each chapter slide, and its opening keeps two voices", () => {
    const essay = rustEssay(OPENING)
    const scenes = essayScenes(essay, "sample")
    const voices = essaySceneVoices(
      essayFormat(essay.template.version).shape,
      scenes
    )
    const at = (id: string): KokoroVoice | undefined =>
      voices[scenes.findIndex((s) => s.id === id)]
    expect([at("intro"), at("ask-1"), at("opening-1"), at("ask-2")]).toEqual([
      "am_fenrir",
      "af_bella",
      "bm_george",
      "af_bella",
    ])
    expect([at("chapter-question-1"), at("chapter-question-2")]).toEqual([
      "bm_fable",
      "af_alloy",
    ])
    expect(
      new Set(chapterIndexes(scenes.map((s) => s.section === "chapter"))).size
    ).toBe(essayChapterMarks(essay).length + 1)
  })
})

describe("before the lanes", () => {
  it("the fixed voices are the ones every pinned version said", () => {
    expect(ESSAY_VOICES).toEqual({
      tutor: "am_michael",
      you: "bm_george",
      asker: "af_heart",
    })
    expect(CALL_VOICES).toEqual({
      intro: "am_michael",
      "brand-in": "am_michael",
      chapter: "am_michael",
      "brand-out": "am_michael",
      open: "am_michael",
      board: "am_michael",
      moved: "af_heart",
      done: "am_fenrir",
      gray: "af_bella",
      mine: "bm_george",
      asks: "af_nicole",
      close: "am_michael",
    })
  })

  it("every pinned essay keeps one voice per speaker, as it had", () => {
    for (let version = 1; version < ESSAY_VERSION; version++) {
      const essay = unwrap(sampleEssay())
      // Drawn as the version is, whatever else it would refuse.
      const at: Essay = {
        ...essay,
        template: { ...essay.template, version },
        opening: OPENING,
      }
      const scenes = essayScenes(at, "sample")
      const voices = essaySceneVoices(essayFormat(version).shape, scenes)
      expect(voices).toEqual(scenes.map((s) => ESSAY_VOICES[s.speaker]))
    }
    expect(essayFormat(ESSAY_CAST_VERSION).shape?.voices).toBeUndefined()
    for (let version = 1; version < INTERVIEW_ESSAY_VERSION; version++)
      expect(interviewEssayFormat(version).shape?.voices).toBeUndefined()
  })

  it("a cards essay in a series with no lanes says its cards as it did", async () => {
    expect(unwrap(await readSeries(SERIES, 3)).voices).toBeUndefined()
    for (const line of await cardsLines("spoken-intro", undefined))
      expect(line.voice).toBe(
        new Map(Object.entries(CARDS_VOICES)).get(line.speaker)
      )
    expect(CARDS_VOICES).toEqual({
      host: "am_michael",
      narrator: "af_heart",
      asker: "af_heart",
      tutor: "af_heart",
    })
  })

  it("the call keeps each section's voice (C840: the lanes don't subsume it)", async () => {
    for (const line of await KINDS.call.lines())
      expect(line.voice).toBe(
        new Map(Object.entries(CALL_VOICES)).get(line.speaker)
      )
  })
})

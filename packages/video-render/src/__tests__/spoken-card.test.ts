import { join } from "node:path"
import {
  CARDS_INDEX_SCHEMA,
  cardsChapterMarks,
  cardsFolderProblems,
  cardsLines,
  cardsScenes,
  parseCardsEssay,
  voicedCardsCutList,
} from "@video-render/cards-essay"
import { parseCutList } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"
import { ESSAY_VOICES } from "@video-render/essay"
import { readSeries } from "@video-render/node"
import type { Series } from "@video-render/series"
import {
  heardSpokenCard,
  sampleSpokenCard,
  spokenCardsOf,
  spokenCardStageOf,
  spokenSceneAt,
  spokenTakeFilesOf,
  spokenTakesOf,
} from "@video-render/spoken-card"
import type { SpokenCard } from "@video-render/spoken-card"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const KEY = "spoken-intro-2026-11-14"

const V3 = await readSeries(
  join(import.meta.dirname, "../sample/series/cheat-sheet"),
  3
)
const seriesOf = (id: string, version: number): Series | null =>
  id === "cheat-sheet" && version === 3 && V3.ok ? V3.value : null

/** The sample essay with its spoken card changed by `change`. */
async function withCard(
  change: (shot: CutList["shots"][number]) => unknown
): Promise<unknown> {
  const cut = await showcase("spoken-intro")
  return {
    ...cut,
    shots: cut.shots.map((s) => (s.id === "introduction" ? change(s) : s)),
  }
}

const refusal = (raw: unknown): string => {
  const parsed = parseCardsEssay(KEY, raw)
  return parsed.ok ? "" : parsed.problems.join("\n")
}

/** A transcript as home keeps it, heard unless `kind` says. */
const transcript = (text: string, kind?: string): unknown => ({
  schema: "some-ui.voice-transcript/1",
  text,
  ...(kind === undefined ? {} : { verdict: { kind } }),
})

const sampleCard = async (): Promise<SpokenCard> => {
  const [first] = spokenCardsOf(await showcase("spoken-intro"))
  if (first === undefined) throw new Error("the sample has no spoken card")
  return first.card
}

describe("a spoken card in a cards essay (WALK7)", () => {
  it("is the sample essay's introduction, which the cards check passes", async () => {
    const files = new Map<string, unknown>([
      ["index.json", { schema: CARDS_INDEX_SCHEMA, essays: [{ key: KEY }] }],
      [`${KEY}.json`, await showcase("spoken-intro")],
    ])
    expect(cardsFolderProblems(files, seriesOf)).toEqual([])
    expect(spokenTakesOf(await showcase("spoken-intro"))).toEqual([
      "sample-take-1",
      "sample-take-2",
    ])
  })

  it("plays each question in the asker's voice and then the owner's take, said in no line", async () => {
    const cut = await showcase("spoken-intro")
    const sample = sampleSpokenCard()
    if (!sample.ok) throw new Error(sample.problems.join("\n"))
    const heard = new Map([
      ["introduction", { ...sample.value, card: "introduction" }],
    ])
    const scenes = cardsScenes(cut, heard)
    expect(scenes.map((s) => [s.id, s.file])).toEqual([
      ["intro", "01-intro"],
      ["introduction-ask-1", "02-introduction-ask-1"],
      ["introduction-take-1", "03-introduction-take-1"],
      ["introduction-ask-2", "04-introduction-ask-2"],
      ["introduction-take-2", "05-introduction-take-2"],
      ["C1", "06-C1"],
      ["close", "07-close"],
    ])
    expect(
      cardsLines(scenes)
        .filter((l) => l.file.includes("introduction"))
        .map((l) => [l.file, l.voice])
    ).toEqual([
      ["02-introduction-ask-1", ESSAY_VOICES.asker],
      ["04-introduction-ask-2", ESSAY_VOICES.asker],
    ])
    expect(scenes[2]?.said).toBe(sample.value.exchanges[0]?.transcript)
    expect(cardsChapterMarks(scenes).map((m) => m.title)).toContain(
      "Introduction"
    )
  })

  it("is drawn in a version whose window is the whole frame, so its still fills it", () => {
    expect(V3.ok ? V3.value.window : null).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    })
  })

  it("draws each of its scenes as its stage's still, the owner's take played whole and cited", async () => {
    const cut = await showcase("spoken-intro")
    const scenes = cardsScenes(cut)
    const takes = scenes.map((s) =>
      s.spoken?.scene.take === undefined
        ? { ms: 2_000 }
        : { ms: 9_000, owner: true as const }
    )
    const voiced = voicedCardsCutList(cut, scenes, takes)
    expect(parseCutList(voiced).ok).toBe(true)
    const answer = voiced.shots.find((s) => s.id === "introduction-take-1")
    expect(answer?.picture).toEqual({
      kind: "still",
      source: "03-introduction-take-1.png",
    })
    expect(answer?.speaker).toBeUndefined()
    expect(answer?.idea).toEqual({
      origin: "you",
      from: { kind: "take", id: "sample-take-1" },
    })
    const ask = voiced.shots.find((s) => s.id === "introduction-ask-1")
    expect(ask?.speaker).toBe("kokoro")
    expect(voiced.shots.find((s) => s.id === "C1")?.picture.kind).toBe("card")
  })

  it("is refused for a take that isn't an id, a long question, burn-ins, or too many exchanges", async () => {
    expect(
      refusal(
        await withCard((s) => ({
          ...s,
          spoken: {
            role: "spoken",
            category: "introduction",
            exchanges: [{ ask: "Why?", take: "<home take id>" }],
          },
        }))
      )
    ).toContain("isn't a take's id")
    expect(
      refusal(
        await withCard((s) => ({
          ...s,
          spoken: {
            role: "spoken",
            category: "introduction",
            exchanges: [{ ask: "word ".repeat(21), take: "t1" }],
          },
        }))
      )
    ).toContain("21 words")
    expect(
      refusal(
        await withCard((s) => ({
          ...s,
          burnIns: [{ kind: "flow", params: {} }],
        }))
      )
    ).toContain("takes no burn-ins")
    expect(
      refusal(
        await withCard((s) => ({
          ...s,
          spoken: {
            role: "spoken",
            category: "introduction",
            exchanges: ["a", "b", "c", "d"].map((t) => ({
              ask: "Why?",
              take: t,
            })),
          },
        }))
      )
    ).not.toBe("")
  })

  it("is refused in a silent essay, before the version that plays one, and as the essay's first scene", async () => {
    const cut = await showcase("spoken-intro")
    expect(
      refusal({ ...cut, series: { ...cut.series, version: 2 } })
    ).toContain("a spoken card plays from version 3 of cheat-sheet")
    expect(
      refusal({ ...cut, series: { ...cut.series, version: 1 } })
    ).toContain("introduction: it says something")
    expect(refusal({ ...cut, shots: cut.shots.slice(1) })).toContain(
      "it has no intro"
    )
  })
})

describe("the takes home hands a spoken card", () => {
  it("are each take's audio, word times and transcript", () => {
    const files = spokenTakeFilesOf(
      ["t1", "t2"],
      [
        "t1.ogg",
        "t1.words.json",
        "t1.transcript.json",
        "t2.m4a",
        "t2.transcript.json",
      ]
    )
    expect(files).toEqual({
      ok: true,
      value: {
        t1: {
          audio: "t1.ogg",
          words: "t1.words.json",
          transcript: "t1.transcript.json",
        },
        t2: { audio: "t2.m4a", words: null, transcript: "t2.transcript.json" },
      },
    })
  })

  it("are refused for a take or transcript missing, and a file of no take the essay plays", () => {
    const files = spokenTakeFilesOf(
      ["t1", "t2"],
      ["t1.ogg", "t2.transcript.json", "t3.ogg", "t3.transcript.json"]
    )
    expect(files.ok ? [] : files.problems).toEqual([
      "t2: answered, and there is no take of it",
      "t3.ogg: names no take the essay answers",
      "t1: home handed no transcript of it (t1.transcript.json)",
      "t3.transcript.json: names no take the essay plays",
    ])
  })

  it("play only what home heard: a take it couldn't make out, or heard nothing in, is refused (HEARD)", async () => {
    const card = await sampleCard()
    const heard = heardSpokenCard("introduction", card, (take) =>
      transcript(`What ${take} says.`, "heard")
    )
    expect(
      heard.ok ? heard.value.exchanges.map((e) => e.transcript) : []
    ).toEqual(["What sample-take-1 says.", "What sample-take-2 says."])
    const kinds: Record<string, string> = {
      "sample-take-1": "garbled",
      "sample-take-2": "nothing_said",
    }
    const refused = heardSpokenCard("introduction", card, (take) =>
      transcript("mm", kinds[take])
    )
    expect(refused.ok ? [] : refused.problems).toEqual([
      "introduction: home couldn't make out sample-take-1; a spoken card plays only a take home heard",
      "introduction: home heard nothing said in sample-take-2",
    ])
    const missing = heardSpokenCard("introduction", card, () => undefined)
    expect(missing.ok).toBe(false)
  })
})

describe("a spoken card's stage", () => {
  const read = (
    data: unknown
  ): { data: unknown; pending: boolean; failed: boolean } => ({
    data,
    pending: false,
    failed: false,
  })

  it("shows the sample with no card named, and the named card as read", () => {
    const shown = spokenCardStageOf({ card: undefined, read: read(undefined) })
    expect(shown.kind === "show" && shown.sample).toBe(true)
    const sample = sampleSpokenCard()
    if (!sample.ok) throw new Error("no sample")
    const card = { ...sample.value, card: "introduction" }
    const named = spokenCardStageOf({ card: "introduction", read: read(card) })
    expect(named).toEqual({ kind: "show", card, sample: false })
    const at = spokenSceneAt(card, "take-2")
    expect([at.index, at.scene.speaker, at.scenes.length]).toEqual([
      3,
      "you",
      4,
    ])
    expect(spokenSceneAt(card, "nope").scene.id).toBe("ask-1")
  })

  it("refuses a card it couldn't read, or another card than the one named", () => {
    const sample = sampleSpokenCard()
    if (!sample.ok) throw new Error("no sample")
    expect(
      spokenCardStageOf({ card: "introduction", read: read(sample.value) }).kind
    ).toBe("none")
    expect(
      spokenCardStageOf({
        card: "introduction",
        read: { data: undefined, pending: false, failed: true },
      }).kind
    ).toBe("none")
    expect(
      spokenCardStageOf({
        card: "introduction",
        read: { data: undefined, pending: true, failed: false },
      }).kind
    ).toBe("waiting")
  })
})

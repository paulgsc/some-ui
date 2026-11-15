import { join } from "node:path"
import {
  CARDS_INDEX_SCHEMA,
  CARDS_MOST_MS,
  CARDS_VOICES,
  cardsChapterMarks,
  cardsFolderProblems,
  cardsLines,
  CLOSE_MARK,
  estimatedCardsMs,
  parseCardsEssay,
  voicedCardsCutList,
} from "@video-render/cards-essay"
import { SAY_MOST_CHARS } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"
import { readSeries } from "@video-render/node"
import type { Series } from "@video-render/series"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

/** The series home's image holds: cheat-sheet's versions 1 and 2. */
const CHEAT_SHEET = await Promise.all(
  [1, 2].map((v) =>
    readSeries(join(import.meta.dirname, "../sample/series/cheat-sheet"), v)
  )
)
const V1 = (id: string, version: number): Series | null => {
  const read = CHEAT_SHEET[version - 1]
  return id === "cheat-sheet" && read?.ok === true ? read.value : null
}

/** A showcase as it was first served: silent, in cheat-sheet v1. */
async function silent(video: string): Promise<CutList> {
  const cut = await showcase(video)
  return {
    ...cut,
    series: { ...cut.series, version: 1 },
    shots: cut.shots
      .filter((s) => s.spoken?.role === "scene")
      .map(({ spoken: _spoken, ...s }) => s),
  }
}

/** Why `raw` isn't the essay NIXOS, in one string. */
const refusal = (raw: unknown): string => {
  const parsed = parseCardsEssay(NIXOS, raw)
  return parsed.ok ? "" : parsed.problems.join("\n")
}

const NIXOS = "nixos-upgrade-2026-11-14"
const RUST = "rust-scratchpad-2026-11-14"

async function folder(): Promise<Map<string, unknown>> {
  return new Map<string, unknown>([
    [
      "index.json",
      { schema: CARDS_INDEX_SCHEMA, essays: [{ key: NIXOS }, { key: RUST }] },
    ],
    [`${NIXOS}.json`, await showcase("nixos-upgrade")],
    [`${RUST}.json`, await showcase("rust-scratchpad")],
  ])
}

describe("a cards essay", () => {
  it("is each showcase, keyed by its slug and its stamp's day", async () => {
    expect(cardsFolderProblems(await folder(), V1)).toEqual([])
  })

  it("is refused for a key that isn't its stamp's day, or isn't a key", async () => {
    const cut = await showcase("nixos-upgrade")
    const misdated = parseCardsEssay("nixos-upgrade-2026-11-13", cut)
    expect(misdated.ok ? [] : misdated.problems).toEqual([
      "its stamp is dated 2026-11-14, and its key 2026-11-13",
    ])
    expect(parseCardsEssay("NixOS 2026-11-14", cut).ok).toBe(false)
  })

  it("is refused for what home can't draw: another series, a picture that isn't a card, a take, a cue, an image, captions", async () => {
    const cut = await showcase("nixos-upgrade")
    const [first, second, third, fourth, ...rest] = cut.shots
    const changed = {
      ...cut,
      series: { id: "conference-call", version: 1 },
      burnIns: [{ kind: "captions", params: {} }],
      shots: [
        { ...first, picture: { kind: "still", source: "a.png" } },
        { ...second, take: { file: "voice/a.wav", inMs: 0, outMs: 1000 } },
        { ...third, overrides: { cues: [{ sound: "whoosh", atMs: 0 }] } },
        {
          ...fourth,
          overrides: {
            background: {
              kind: "image",
              image: { file: "a.png", sha256: "0".repeat(64) },
            },
          },
        },
        ...rest,
      ],
    }
    const parsed = parseCardsEssay(NIXOS, changed)
    expect(parsed.ok).toBe(false)
    const problems = parsed.ok ? [] : parsed.problems.join("\n")
    for (const reason of [
      "conference-call",
      "not a card",
      "plays a take",
      "plays cues",
      "background is an image",
      "captions",
    ])
      expect(problems).toContain(reason)
  })

  it("is refused with no stamp", async () => {
    const cut = { ...(await showcase("nixos-upgrade")), stamp: undefined }
    const parsed = parseCardsEssay(NIXOS, cut)
    expect(parsed.ok ? "" : parsed.problems.join("\n")).toContain("no stamp")
  })
})

describe("the cards folder", () => {
  it("names an essay the index lists and the folder lacks, and one it forgets", async () => {
    const files = await folder()
    files.delete(`${RUST}.json`)
    files.set("stray-2026-11-01.json", await showcase("rust-scratchpad"))
    expect(cardsFolderProblems(files, V1)).toEqual([
      `${RUST}.json: the index lists it, and there is no such file`,
      "stray-2026-11-01.json: the index doesn't list it",
    ])
  })

  it("names an essay pinning a version of its series home doesn't hold", async () => {
    const files = await folder()
    const cut = await showcase("rust-scratchpad")
    files.set(`${RUST}.json`, { ...cut, series: { ...cut.series, version: 9 } })
    expect(cardsFolderProblems(files, V1)).toEqual([
      `${RUST}.json: cheat-sheet has no version 9`,
    ])
  })

  it("names an essay that asks its series for what it lacks: a look's cues and bed, a burn-in it has no design for", async () => {
    const files = await folder()
    const cut = await showcase("rust-scratchpad")
    files.set(`${RUST}.json`, {
      ...cut,
      look: "lively",
      burnIns: [{ kind: "headline", params: {} }],
    })
    const problems = cardsFolderProblems(files, V1)
    for (const p of problems) expect(p).toMatch(new RegExp(`^${RUST}\\.json: `))
    // Only resolving against the series says these, so the essay got there.
    const said = problems.join("\n")
    expect(said).toContain("the series has no whoosh sound")
    expect(said).toContain("the headline burn-in names no design")
    expect(said).toContain("the series has no music bed")
  })

  it("lists its essays newest first, each once", async () => {
    const files = await folder()
    for (const essays of [
      [{ key: "a-2026-11-01" }, { key: NIXOS }],
      [{ key: NIXOS }, { key: NIXOS }],
    ]) {
      files.set("index.json", { schema: CARDS_INDEX_SCHEMA, essays })
      expect(cardsFolderProblems(files, V1).join("\n")).toContain(
        "newest first, each once"
      )
    }
  })
})

describe("a spoken essay (EXPLAIN6)", () => {
  it("is each showcase: an intro, a chapter line and narration for every card, and a close", async () => {
    for (const video of ["nixos-upgrade", "rust-scratchpad"]) {
      const cut = await showcase(video)
      const roles = cut.shots.map((s) => s.spoken?.role)
      expect(roles[0]).toBe("intro")
      expect(roles.at(-1)).toBe("close")
      expect(roles.slice(1, -1).every((r) => r === "scene")).toBe(true)
      expect(estimatedCardsMs(cut)).toBeLessThanOrEqual(CARDS_MOST_MS)
    }
  })

  it("is refused with no intro, a scene that says nothing, or an intro or close out of place", async () => {
    const cut = await showcase("nixos-upgrade")
    const [intro, first, ...rest] = cut.shots
    if (first === undefined) throw new Error("the showcase has no scenes")
    const { spoken: _spoken, ...mute } = first
    expect(refusal({ ...cut, shots: [first, ...rest] })).toContain(
      "it has no intro"
    )
    expect(refusal({ ...cut, shots: [intro, mute, ...rest] })).toContain(
      `${mute.id}: it says nothing`
    )
    expect(refusal({ ...cut, shots: [first, intro, ...rest] })).toContain(
      "intro: only the first scene is the intro"
    )
    const close = rest.at(-1)
    expect(
      refusal({ ...cut, shots: [intro, close, first, ...rest.slice(0, -1)] })
    ).toContain("close: only the last scene is the close")
    expect(
      refusal({
        ...cut,
        shots: [
          intro,
          { ...mute, spoken: { role: "scene", chapter: "A chapter." } },
        ],
      })
    ).toContain("narration")
  })

  it("is refused for a line home's speaker can't say: empty, punctuation alone, or too long", async () => {
    const cut = await showcase("nixos-upgrade")
    const [intro, ...rest] = cut.shots
    for (const [said, why] of [
      ["   ", "it says nothing"],
      ["... — !", "no letter or digit"],
      ["word ".repeat(SAY_MOST_CHARS), `at most ${SAY_MOST_CHARS}`],
    ] as const)
      expect(
        refusal({
          ...cut,
          shots: [{ ...intro, spoken: { role: "intro", said } }, ...rest],
        })
      ).toContain(why)
  })

  it("is refused past ten minutes by its words, and told to split", async () => {
    const cut = await showcase("nixos-upgrade")
    const long = "a long sentence of words that teach something ".repeat(40)
    const shots = cut.shots.map((s) =>
      s.spoken?.role === "scene"
        ? { ...s, spoken: { ...s.spoken, narration: long } }
        : s
    )
    expect(refusal({ ...cut, shots })).toContain("split it into two essays")
  })

  it("is said in silence in version 1: a spoken line there is refused", async () => {
    const cut = await silent("nixos-upgrade")
    expect(refusal(cut)).toBe("")
    const [first, ...rest] = await showcase("nixos-upgrade").then((c) =>
      c.shots.slice(1)
    )
    expect(refusal({ ...cut, shots: [first, ...rest.slice(0, -1)] })).toContain(
      "is silent: a spoken essay pins version 2"
    )
  })

  it("is the newest in the folder; an older silent essay stays as first served", async () => {
    const files = await folder()
    files.set(`${RUST}.json`, await silent("rust-scratchpad"))
    expect(cardsFolderProblems(files, V1)).toEqual([])
    files.set(`${NIXOS}.json`, await silent("nixos-upgrade"))
    expect(cardsFolderProblems(files, V1).join("\n")).toContain(
      `${NIXOS}.json: it's silent, and the newest essay is spoken`
    )
  })

  it("says the intro, each chapter line in the host's voice then its narration in the narrator's, and the close", async () => {
    const cut = await showcase("rust-scratchpad")
    const lines = cardsLines(cut)
    expect(lines.map((l) => [l.file, l.voice])).toEqual([
      ["01-intro", CARDS_VOICES.host],
      ...cut.shots
        .filter((s) => s.spoken?.role === "scene")
        .flatMap((s, i) => [
          [
            `${String(2 * i + 2).padStart(2, "0")}-${s.id}-chapter`,
            CARDS_VOICES.host,
          ],
          [
            `${String(2 * i + 3).padStart(2, "0")}-${s.id}`,
            CARDS_VOICES.narrator,
          ],
        ]),
      [`${String(lines.length).padStart(2, "0")}-close`, CARDS_VOICES.host],
    ])
    const marks = cardsChapterMarks(lines)
    expect(marks[0]).toEqual({
      scene: "C1-chapter",
      title: "Chapter one. Open it, write, quit, and it's gone.",
    })
    expect(marks.at(-1)).toEqual({ scene: "close", title: CLOSE_MARK })
  })

  it("holds each card for its take, captions it, and cuts from a chapter line to its narration", async () => {
    const cut = await showcase("nixos-upgrade")
    const lines = cardsLines(cut)
    const words = [{ text: "Here", startMs: 0, endMs: 300 }]
    const voiced = voicedCardsCutList(
      cut,
      lines,
      lines.map((_, i) => (i === 0 ? null : { ms: 2_000, words }))
    )
    expect(voiced.burnIns).toEqual([{ kind: "captions", params: {} }])
    const [intro, chapter, narration] = voiced.shots
    // No take: held for its words' reading time, never its written length.
    expect(intro?.take).toBeUndefined()
    expect(intro?.durationMs).not.toBe(cut.shots[0]?.durationMs)
    expect(chapter).toMatchObject({
      id: "C1-chapter",
      durationMs: 300 + 2_000 + 700,
      speaker: "kokoro",
      take: {
        file: `${lines[1]?.file ?? ""}.wav`,
        inMs: 0,
        outMs: 2_000,
        words,
      },
      burnIns: cut.shots[1]?.burnIns,
    })
    expect(narration).toMatchObject({
      id: "C1",
      overrides: { transitionIn: "cut" },
    })
    expect(voiced.shots.every((s) => s.spoken === undefined)).toBe(true)
  })
})

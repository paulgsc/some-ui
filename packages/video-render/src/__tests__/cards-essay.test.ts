import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  CARDS_INDEX_SCHEMA,
  cardsFolderProblems,
  parseCardsEssay,
} from "@video-render/cards-essay"
import { parseCutList } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"
import { readSeries } from "@video-render/node"
import type { Series } from "@video-render/series"
import { describe, expect, it } from "vitest"

const VIDEOS = join(import.meta.dirname, "../sample/videos")

async function showcase(video: string): Promise<CutList> {
  const raw: unknown = JSON.parse(
    await readFile(join(VIDEOS, video, "cut-list.json"), "utf8")
  )
  const parsed = parseCutList(raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
  return parsed.value
}

/** The series home's image holds: cheat-sheet's first version. */
const CHEAT_SHEET = await readSeries(
  join(import.meta.dirname, "../sample/series/cheat-sheet"),
  1
)
const V1 = (id: string, version: number): Series | null =>
  id === "cheat-sheet" && version === 1 && CHEAT_SHEET.ok
    ? CHEAT_SHEET.value
    : null

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
    files.set(`${RUST}.json`, { ...cut, series: { ...cut.series, version: 2 } })
    expect(cardsFolderProblems(files, V1)).toEqual([
      `${RUST}.json: cheat-sheet has no version 2`,
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
    expect(problems.length).toBeGreaterThan(0)
    for (const p of problems) expect(p).toMatch(new RegExp(`^${RUST}\\.json: `))
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

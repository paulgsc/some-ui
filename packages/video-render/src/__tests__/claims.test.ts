/**
 * An essay is an authority (#3036): every line's sources, held to its
 * stamp's commit and followed past it. The family: a source's kind (lines,
 * a quote, both) against what the file is at a commit (absent, shorter,
 * saying it, saying it elsewhere, saying something else) and whether a
 * copy of the repository was given at all.
 */

import { cardsFolderSources, parseCardsEssay } from "@video-render/cards-essay"
import type { ReadFile } from "@video-render/claims"
import { claimsOf, sourceProblems, staleClaims } from "@video-render/claims"
import type { CutList } from "@video-render/cut-list"
import { parseCutList } from "@video-render/cut-list"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const KEY = "nixos-upgrade-2026-11-14"
const DOTFILES = "paulgsc/dotfiles"
const WAS = "91cb11b"
const IS = "abcdef1"

const MODULE = [
  "{ config, ... }:",
  "{",
  "  system.autoUpgrade.enable = true;",
  '  system.autoUpgrade.dates = "04:00";',
  "}",
  "",
].join("\n")

/** The repository's files at each commit, by path. */
type Tree = Readonly<Record<string, Readonly<Record<string, string>>>>

/**
 * A reader over `tree`, a clone of the dotfiles holding only its commits;
 * no other repository's clone is given.
 */
const reader =
  (tree: Tree): ReadFile =>
  (repo, commit, path) => {
    if (repo !== DOTFILES) return { kind: "no-clone" }
    const files = tree[commit]
    if (files === undefined) return { kind: "no-commit" }
    const text = files[path]
    return text === undefined ? { kind: "absent" } : { kind: "file", text }
  }

/** The nixos showcase with `sources` on its first scene's narration. */
async function cited(sources: ReadonlyArray<unknown>): Promise<CutList> {
  const cut = await showcase("nixos-upgrade")
  const raw = {
    ...cut,
    shots: cut.shots.map((s) =>
      s.id === "C1" && s.spoken !== undefined
        ? { ...s, spoken: { ...s.spoken, sources } }
        : s
    ),
  }
  const parsed = parseCardsEssay(KEY, raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
  return parsed.value
}

const AUTO = { repo: DOTFILES, path: "nixos/upgrade.nix" }

describe("a line's sources", () => {
  it("are read on an intro, a scene's narration and a close, and owed only by narration", async () => {
    const cut = await showcase("nixos-upgrade")
    const claims = claimsOf(cut)
    expect(claims.map((c) => c.scene)).toEqual([
      "intro",
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "close",
    ])
    expect(claims.filter((c) => c.owed).map((c) => c.scene)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ])
  })

  it("name lines, a quote or both, and are refused naming neither or lines backwards", async () => {
    await expect(cited([{ ...AUTO, lines: [3, 4] }])).resolves.toBeDefined()
    await expect(
      cited([{ ...AUTO, quote: "autoUpgrade" }])
    ).resolves.toBeDefined()
    await expect(cited([AUTO])).rejects.toThrow("neither lines nor a quote")
    await expect(cited([{ ...AUTO, lines: [4, 3] }])).rejects.toThrow(
      "its first line is after its last"
    )
    await expect(
      cited([{ ...AUTO, path: "../etc/passwd", lines: [1, 1] }])
    ).rejects.toThrow("isn't a path inside the repository")
    await expect(cited([])).rejects.toThrow()
  })

  it("are refused citing a repository the stamp doesn't pin, whose commit would be no one's", async () => {
    await expect(
      cited([{ repo: "paulgsc/server", path: "a.nix", lines: [1, 1] }])
    ).rejects.toThrow(
      "it cites paulgsc/server, and the stamp pins paulgsc/dotfiles"
    )
  })

  it("parse in any cut list, and only a cards essay holds them to its stamp", async () => {
    const cut = await showcase("nixos-upgrade")
    const unpinned = {
      ...cut,
      shots: cut.shots.map((s) =>
        s.id === "C1" && s.spoken !== undefined
          ? {
              ...s,
              spoken: {
                ...s.spoken,
                sources: [
                  { repo: "paulgsc/server", path: "a.nix", lines: [1, 1] },
                ],
              },
            }
          : s
      ),
    }
    const parsed = parseCutList(unpinned)
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && claimsOf(parsed.value)[1]?.sources).toHaveLength(1)
    expect(parseCardsEssay(KEY, unpinned).ok).toBe(false)
  })

  it("are refused when the stamp pins their repository twice", async () => {
    const cut = await cited([{ ...AUTO, lines: [1, 1] }])
    const twice = {
      ...cut,
      stamp: {
        sources: [`${DOTFILES}@${WAS}`, `${DOTFILES}@${IS}`],
        date: "2026-11-14",
      },
    }
    const parsed = parseCardsEssay(KEY, twice)
    expect(parsed.ok ? [] : parsed.problems).toContain(
      `its stamp pins ${DOTFILES} twice, so its sources can't say at which commit they are read`
    )
  })
})

describe("sourceProblems", () => {
  const tree: Tree = { [WAS]: { [AUTO.path]: MODULE } }

  it("holds a source whose lines and quote are said at the stamp's commit", async () => {
    const check = sourceProblems(
      await cited([
        { ...AUTO, lines: [3, 4], quote: "autoUpgrade.dates" },
        { ...AUTO, quote: "system.autoUpgrade.enable\n = true" },
      ]),
      reader(tree),
      true
    )
    expect(check.problems).toEqual([])
    expect(check.notes).toEqual([
      "4 of 5 scenes' narration names no source: C2, C3, C4, C5",
    ])
  })

  it("refuses a missing file, lines past its end, and a quote not in its lines", async () => {
    const check = sourceProblems(
      await cited([
        { ...AUTO, path: "nixos/gone.nix", lines: [1, 1] },
        { ...AUTO, lines: [5, 6] },
        { ...AUTO, lines: [1, 2], quote: "autoUpgrade" },
        { ...AUTO, quote: "runs as root" },
      ]),
      reader(tree),
      true
    )
    expect(check.problems).toEqual([
      `C1: ${DOTFILES} nixos/gone.nix:1: there is no such file at ${WAS}`,
      `C1: ${DOTFILES} ${AUTO.path}:5-6 at ${WAS}: it has 5 lines, and the source cites up to line 6`,
      `C1: ${DOTFILES} ${AUTO.path}:1-2 at ${WAS}: "autoUpgrade" isn't said in those lines`,
      `C1: ${DOTFILES} ${AUTO.path} at ${WAS}: "runs as root" isn't said in it`,
    ])
  })

  it("refuses lines that are blank, which would hold whatever the file says", async () => {
    const blank = { [WAS]: { [AUTO.path]: MODULE.replace("{\n", "{\n\n") } }
    const check = sourceProblems(
      await cited([{ ...AUTO, lines: [3, 3] }]),
      reader(blank),
      true
    )
    expect(check.problems).toEqual([
      `C1: ${DOTFILES} ${AUTO.path}:3 at ${WAS}: the lines it cites are blank`,
    ])
  })

  it("refuses, when strict, a commit no clone given holds, once for the commit", async () => {
    const cut = await cited([
      { ...AUTO, lines: [1, 1] },
      { ...AUTO, quote: "autoUpgrade" },
    ])
    const shallow = `${DOTFILES}@${WAS}: the clone given doesn't hold that commit: fetch it, or more of its history, and check again`
    const none = `${DOTFILES}@${WAS}: no clone of it was given, so its sources weren't checked`
    expect(sourceProblems(cut, reader({}), true).problems).toEqual([shallow])
    expect(
      sourceProblems(cut, () => ({ kind: "no-clone" }), true).problems
    ).toEqual([none])
    // An older essay's commits are another session's: only noted.
    const older = sourceProblems(cut, reader({}), false)
    expect(older.problems).toEqual([])
    expect(older.notes).toContain(shallow)
    expect(
      sourceProblems(cut, () => ({ kind: "no-clone" }), false).notes
    ).toContain(none)
  })

  it("is the folder's, by each essay's file, passing over an essay the folder check refuses", async () => {
    const cut = await cited([{ ...AUTO, quote: "runs as root" }])
    const older = await cited([{ ...AUTO, lines: [1, 1] }])
    const files = new Map<string, unknown>([
      [
        "index.json",
        {
          schema: "some-ui.cards-index/1",
          essays: [
            { key: KEY },
            { key: "nixos-upgrade-old-2026-11-13" },
            { key: "broken-2026-11-13" },
          ],
        },
      ],
      [`${KEY}.json`, cut],
      [
        "nixos-upgrade-old-2026-11-13.json",
        {
          ...older,
          stamp: { sources: [`${DOTFILES}@1234567`], date: "2026-11-13" },
        },
      ],
      ["broken-2026-11-13.json", { not: "an essay" }],
    ])
    const check = cardsFolderSources(files, reader(tree))
    expect(check.problems).toEqual([
      `${KEY}.json: C1: ${DOTFILES} ${AUTO.path} at ${WAS}: "runs as root" isn't said in it`,
    ])
    // The newest is refused for its source; the older, whose commit no
    // clone holds, is only noted.
    expect(check.notes).toEqual([
      `${KEY}.json: 4 of 5 scenes' narration names no source: C2, C3, C4, C5`,
      "nixos-upgrade-old-2026-11-13.json: 4 of 5 scenes' narration names no source: C2, C3, C4, C5",
      `nixos-upgrade-old-2026-11-13.json: ${DOTFILES}@1234567: the clone given doesn't hold that commit: fetch it, or more of its history, and check again`,
    ])
  })
})

describe("staleClaims", () => {
  const moved = MODULE.replace("{\n", "{\n  # Nightly.\n")
  const changed = MODULE.replace('"04:00"', '"05:00"')

  async function staleAt(
    files: Readonly<Record<string, string>>
  ): Promise<Array<string>> {
    const cut = await cited([
      { ...AUTO, lines: [4, 4] },
      { ...AUTO, quote: "autoUpgrade.enable = true" },
    ])
    return staleClaims(
      cut,
      reader({ [WAS]: { [AUTO.path]: MODULE }, [IS]: files }),
      (repo) => (repo === DOTFILES ? IS : undefined)
    ).stale.map((s) => s.why)
  }

  it("lists nothing when what each source cited is still said, even moved", async () => {
    expect(await staleAt({ [AUTO.path]: moved })).toEqual([])
  })

  it("lists a line whose cited lines read differently", async () => {
    expect(await staleAt({ [AUTO.path]: changed })).toEqual([
      `its lines read differently at ${IS}`,
    ])
  })

  it("lists a quote no longer said, and a file gone", async () => {
    expect(
      await staleAt({ [AUTO.path]: MODULE.replace("= true", "= false") })
    ).toEqual([`"autoUpgrade.enable = true" isn't said in it at ${IS}`])
    expect(await staleAt({})).toEqual([
      `there is no such file at ${IS}`,
      `there is no such file at ${IS}`,
    ])
  })

  it("passes over a repository still at its stamp's commit", async () => {
    const cut = await cited([{ ...AUTO, lines: [4, 4] }])
    const read = reader({ [WAS]: { [AUTO.path]: MODULE } })
    expect(staleClaims(cut, read, () => WAS)).toEqual({
      stale: [],
      unfollowed: [],
    })
  })

  it("never counts a source it couldn't follow as fresh", async () => {
    const cut = await cited([{ ...AUTO, lines: [4, 4] }])
    const tree = { [WAS]: { [AUTO.path]: MODULE } }
    expect(staleClaims(cut, reader(tree), () => undefined).unfollowed).toEqual([
      `${DOTFILES}: no clone of it was given, or it has no such commit to follow to`,
    ])
    expect(staleClaims(cut, reader({}), () => IS).unfollowed).toEqual([
      `${DOTFILES}@${WAS}: the clone given doesn't hold that commit: fetch it, or more of its history, and check again`,
    ])
    const broken = await cited([{ ...AUTO, quote: "runs as root" }])
    const both = { ...tree, [IS]: { [AUTO.path]: MODULE } }
    expect(staleClaims(broken, reader(both), () => IS).unfollowed).toEqual([
      `C1: ${DOTFILES} ${AUTO.path}: it didn't hold at ${WAS}, so cards-check refuses it`,
    ])
  })
})

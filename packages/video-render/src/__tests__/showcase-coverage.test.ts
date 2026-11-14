/**
 * A showcase covers its source (#2979; the owner, 2026-11-14: "how is this
 * ensured?"). A showcase whose folder has a `covers.json` names the file it
 * explains, at one of the commits its stamp names, and maps every heading
 * and every bold bullet (`- **…**`) of that file to the cards that cover it.
 * The file itself is kept beside it, byte for byte as it was at that commit
 * (its git blob id says so: `git rev-parse <commit>:<file>` gives the same),
 * so this runs offline and gives the same answer every time. Restamping the
 * cut list to a newer commit fails here until the copy and the map follow it,
 * and a source section the essay leaves out fails here by name.
 *
 * What it can't see: a source that moved past the stamp. The stamp dates the
 * cards for that (`stamp.ts`); a session renews the essay at a newer commit.
 */

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseCutList } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const VIDEOS = join(import.meta.dirname, "../sample/videos")

const CoversSchema = z.strictObject({
  /** `owner/repo@sha`, one of the cut list's stamp sources. */
  source: z.string().regex(/^[\w.-]+\/[\w.-]+@[0-9a-f]{7,40}$/),
  /** The file's path in that repository. */
  file: z.string().min(1),
  /** The file's git blob id at that commit. */
  blob: z.string().regex(/^[0-9a-f]{40}$/),
  /** The copy kept beside the cut list, relative to its folder. */
  copy: z.string().min(1),
  /** Each heading or bold bullet of the file, and the shots that cover it. */
  covers: z.record(z.string(), z.array(z.string()).min(1)),
})

type Covers = z.infer<typeof CoversSchema>

/** What git names `text` by: the SHA-1 of its blob. */
function blobId(bytes: Buffer): string {
  return createHash("sha1")
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex")
}

/**
 * Every heading (`#` to `######`, as written) and every bold bullet's bold
 * part (`- **…**`) of a markdown file, in order, outside fenced code.
 */
function sourceItems(markdown: string): Array<string> {
  const items: Array<string> = []
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = /^(#{1,6} .+?)\s*$/.exec(line)
    if (heading?.[1] !== undefined) items.push(heading[1])
    const bold = /^\s*- \*\*(.+?)\*\*/.exec(line)
    if (bold?.[1] !== undefined) items.push(bold[1])
  }
  return items
}

/** Every way `covers` fails to show that `cut` covers `source`. */
function coverageProblems(
  covers: Covers,
  copy: Buffer,
  cut: CutList
): Array<string> {
  const shots = new Set(cut.shots.map((s) => s.id))
  const items = sourceItems(copy.toString("utf8"))
  const mapped = Object.entries(covers.covers)
  return [
    ...(cut.stamp?.sources.includes(covers.source) === true
      ? []
      : [
          `${covers.source} is not one of the stamp's sources (${(cut.stamp?.sources ?? []).join(", ")}): restamped, the copy and the map follow`,
        ]),
    ...(blobId(copy) === covers.blob
      ? []
      : [
          `${covers.copy} isn't ${covers.file} at ${covers.source} (blob ${covers.blob})`,
        ]),
    ...items
      .filter((item) => covers.covers[item] === undefined)
      .map((item) => `"${item}" in ${covers.file}: no card covers it`),
    ...mapped
      .filter(([item]) => !items.includes(item))
      .map(([item]) => `"${item}": ${covers.file} has no such section`),
    ...mapped.flatMap(([item, ids]) =>
      ids
        .filter((id) => !shots.has(id))
        .map((id) => `"${item}": the cut list has no shot ${id}`)
    ),
  ]
}

async function showcasesWithCovers(): Promise<Array<string>> {
  const videos = await readdir(VIDEOS)
  const withCovers: Array<string> = []
  for (const video of videos) {
    const files = await readdir(join(VIDEOS, video))
    if (files.includes("covers.json")) withCovers.push(video)
  }
  return withCovers
}

async function read(
  video: string
): Promise<{ covers: Covers; copy: Buffer; cut: CutList }> {
  const dir = join(VIDEOS, video)
  const covers = CoversSchema.parse(
    JSON.parse(await readFile(join(dir, "covers.json"), "utf8"))
  )
  const cut = parseCutList(
    JSON.parse(await readFile(join(dir, "cut-list.json"), "utf8"))
  )
  if (!cut.ok) throw new Error(cut.problems.join("\n"))
  return {
    covers,
    copy: await readFile(join(dir, covers.copy)),
    cut: cut.value,
  }
}

describe("a showcase covers its source", () => {
  it("is checked for every showcase that names one, rust-scratchpad among them", async () => {
    expect(await showcasesWithCovers()).toContain("rust-scratchpad")
  })

  it("covers every section of its source at its stamp's commit", async () => {
    for (const video of await showcasesWithCovers()) {
      const { covers, copy, cut } = await read(video)
      expect(coverageProblems(covers, copy, cut), video).toEqual([])
    }
  })
})

describe("the coverage check can fail", () => {
  const source = [
    "# tool",
    "## Commands",
    "```sh",
    "# not a heading",
    "```",
    "- **A footgun.** Explained.",
    "- not bold",
  ].join("\n")
  const copy = Buffer.from(source)
  const cutWith = async (sources: Array<string>): Promise<CutList> => {
    const { cut } = await read("rust-scratchpad")
    return { ...cut, stamp: { sources, date: "2026-11-14" } }
  }
  const covers = (map: Covers["covers"], blob = blobId(copy)): Covers => ({
    source: "o/r@abcdef1",
    file: "README.md",
    blob,
    copy: "copy.txt",
    covers: map,
  })

  it("reads headings and bold bullets, not fenced code or plain bullets", () => {
    expect(sourceItems(source)).toEqual(["# tool", "## Commands", "A footgun."])
  })

  it("names a section no card covers, as the nano and refresh ones were", async () => {
    const cut = await cutWith(["o/r@abcdef1"])
    expect(
      coverageProblems(
        covers({ "# tool": ["C1"], "## Commands": ["C2"] }),
        copy,
        cut
      )
    ).toEqual([`"A footgun." in README.md: no card covers it`])
  })

  it("refuses a copy that isn't the file at that commit, a stale source, a gone section and a gone shot", async () => {
    const cut = await cutWith(["o/r@1234567"])
    const problems = coverageProblems(
      covers(
        {
          "# tool": ["C1"],
          "## Commands": ["C99"],
          "A footgun.": ["C2"],
          "## Gone": ["C1"],
        },
        "0".repeat(40)
      ),
      copy,
      cut
    )
    expect(problems).toHaveLength(4)
    expect(problems[0]).toContain("not one of the stamp's sources")
    expect(problems[1]).toContain("isn't README.md at")
    expect(problems[2]).toContain("has no such section")
    expect(problems[3]).toContain("no shot C99")
  })
})

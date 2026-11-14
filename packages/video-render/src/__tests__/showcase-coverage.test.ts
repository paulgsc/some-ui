/**
 * A showcase covers its source (#2979; the owner, 2026-11-14: "how is this
 * ensured?"). A showcase whose folder has a `covers.json` names the file it
 * explains, at one of the commits its stamp names, and maps every heading
 * and every bold list item (`- **…**`, `* **…**`, `1. **…**`) of that file to
 * the cards that cover it. A copy of the file is kept beside it with its git
 * blob id: this checks the copy against that id, and `git rev-parse
 * <commit>:<file>` gives the same id for the file at that commit, so a
 * reviewer of the copy checks it once and this runs offline after that. Restamping the
 * cut list to a newer commit fails here until the copy and the map follow it,
 * and a source section the essay leaves out fails here by name.
 *
 * What it can't see: a source that moved past the stamp. The stamp dates the
 * cards for that (`stamp.ts`); a session renews the essay at a newer commit.
 */

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { CutList } from "@video-render/cut-list"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { showcase, VIDEOS } from "./showcase"

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

/** What git names `bytes` by: the SHA-1 of its blob. */
function blobId(bytes: Buffer): string {
  return createHash("sha1")
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex")
}

/**
 * Every heading and every bold list item's bold part of a markdown file, in
 * order, outside fenced code. A heading is written as ATX (`#` to `######`,
 * up to three spaces in) and kept as `#… text`, or setext (a line of `=` or
 * `-` under its text) and kept as `# text` or `## text`. A list item is
 * `-`, `*`, `+` or a number with `.` or `)`, starting `**…**`.
 */
function sourceItems(markdown: string): Array<string> {
  const items: Array<string> = []
  let fence: string | null = null
  let previous = ""
  for (const line of markdown.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence === null && marker !== undefined) {
      fence = marker
    } else if (
      fence !== null &&
      marker !== undefined &&
      marker[0] === fence[0] &&
      marker.length >= fence.length &&
      line.trim() === marker
    ) {
      fence = null
    } else if (fence === null) {
      const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
      const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(line)?.[1]
      const bold = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\*\*(.+?)\*\*/.exec(line)?.[1]
      const plain = previous.trim()
      if (atx?.[1] !== undefined && atx[2] !== undefined)
        items.push(`${atx[1]} ${atx[2]}`)
      else if (
        setext !== undefined &&
        plain !== "" &&
        !/^(?:[-*+]|\d+[.)])\s/.test(plain) &&
        !plain.startsWith("#")
      )
        items.push(`${setext.startsWith("=") ? "#" : "##"} ${plain}`)
      else if (bold !== undefined) items.push(bold)
    }
    previous = fence === null ? line : ""
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
  return {
    covers,
    copy: await readFile(join(dir, covers.copy)),
    cut: await showcase(video),
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

  it("reads every way markdown writes a heading or a bold item, and no fence's body", () => {
    const written = [
      " ## Indented",
      "Setext one",
      "===",
      "Setext two",
      "---",
      "* **Starred.**",
      "+ **Plussed.**",
      "1. **Numbered.**",
      "2) **Bracketed.**",
      "~~~",
      "# in a tilde fence",
      "~~~",
      "````",
      "```",
      "# in a long fence",
      "````",
      "",
      "---",
    ].join("\n")
    expect(sourceItems(written)).toEqual([
      "## Indented",
      "# Setext one",
      "## Setext two",
      "Starred.",
      "Plussed.",
      "Numbered.",
      "Bracketed.",
    ])
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

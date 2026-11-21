import { parseCardsEssay } from "@video-render/cards-essay"
import type { CutList } from "@video-render/cut-list"
import {
  isPublicAddress,
  pageFile,
  PAGES_DIR,
  PAGES_SCHEMA,
  pagesOf,
  parsePages,
  type PageRecord,
} from "@video-render/page"
import { resolveScreens, type Handed } from "@video-render/snip"
import { SCREEN_ZOOM } from "@video-render/zoom"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const SHA = "a1b2c3d4e5f6".padEnd(64, "0")
const URL_3376 = "https://github.com/paulgsc/some-ui/actions/runs/44944305421"
const AT = "2026-11-21T23:02:11.000Z"
const FILE = pageFile(URL_3376, SHA)

/** #3376's run graph, its jobs boxed, as the capture writes it. */
const run = (): PageRecord => ({
  url: URL_3376,
  capturedAt: AT,
  title: "chore(assurance): place stage_want's store · paulgsc/some-ui",
  width: 2880,
  height: 1800,
  scale: 2,
  regions: [
    { name: "jobs", box: { x: 20, y: 380, width: 410, height: 520 } },
    { name: "duration", box: { x: 940, y: 300, width: 140, height: 50 } },
  ],
  image: { name: FILE, bytes: 512_000, sha256: SHA },
})

const handed = (pages: Array<PageRecord>): Handed => {
  const parsed = parsePages({ schema: PAGES_SCHEMA, pages })
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return { snips: null, clips: null, pages: parsed.value }
}

type Of = {
  from: "pages"
  url: string
  capturedAt: string
  file: string
  at?: Array<string>
}

const page = (at?: Array<string>, over: Partial<Of> = {}): Of => ({
  from: "pages",
  url: URL_3376,
  capturedAt: AT,
  file: FILE,
  ...(at ? { at } : {}),
  ...over,
})

/** The Rust Scratchpad essay, its scenes from the second on showing `pictures`. */
async function showing(pictures: ReadonlyArray<Of>): Promise<CutList> {
  const cut = await showcase("rust-scratchpad")
  const raw = {
    ...cut,
    shots: cut.shots.map((shot, i) => {
      const of = pictures[i - 1]
      return of === undefined
        ? shot
        : { ...shot, picture: { kind: "screen", of } }
    }),
  }
  const parsed = parseCardsEssay("rust-scratchpad-2026-11-14", raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("a public page as a screen", () => {
  it("is named by where it is and its picture's hash", () => {
    expect(FILE).toBe(
      "github-com-paulgsc-some-ui-actions-runs-44944305421-a1b2c3d4e5f6.png"
    )
    expect(pageFile("https://docs.github.com/en/a/b?plan=free#x", SHA)).toBe(
      "docs-github-com-en-a-b-a1b2c3d4e5f6.png"
    )
  })

  it("is refused on a record whose picture its name isn't, or that names a part twice", () => {
    const wrong = parsePages({
      schema: PAGES_SCHEMA,
      pages: [{ ...run(), image: { ...run().image, sha256: "f".repeat(64) } }],
    })
    expect(wrong.ok ? "" : wrong.problems.join("\n")).toContain(
      "is not the picture its hash names"
    )
    const twice = parsePages({
      schema: PAGES_SCHEMA,
      pages: [{ ...run(), regions: [...run().regions, ...run().regions] }],
    })
    expect(twice.ok ? "" : twice.problems.join("\n")).toContain(
      "a part is named twice"
    )
  })

  it("is a cards essay's scene, and names each page once", async () => {
    const cut = await showing([page(), page(["jobs"])])
    expect(pagesOf(cut).map((of) => of.file)).toEqual([FILE])
  })

  it("is held whole above the captions, or zoomed to the parts it names", async () => {
    const cut = await showing([page(), page(["jobs", "duration"])])
    const drawn = resolveScreens(cut, handed([run()]), { foot: 0.25 })
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    expect(drawn.value.shots[1]?.picture).toEqual({
      kind: "composition",
      ref: SCREEN_ZOOM,
      variables: {
        picture: `${PAGES_DIR}/${FILE}`,
        width: 1440,
        height: 900,
        scale: 2,
        stops: "[]",
        foot: 0.25,
      },
      files: [`${PAGES_DIR}/${FILE}`],
    })
    expect(drawn.value.shots[2]?.picture).toMatchObject({
      ref: SCREEN_ZOOM,
      variables: {
        stops: JSON.stringify([
          { x: 20, y: 380, width: 410, height: 520 },
          { x: 940, y: 300, width: 140, height: 50 },
        ]),
      },
    })
  })

  it("is refused when home didn't hand it, never a blank frame", async () => {
    const cut = await showing([page()])
    const drawn = resolveScreens(cut, { snips: null, clips: null })
    expect(drawn.ok ? "" : drawn.problems.join("\n")).toContain(
      `C1: it shows the page ${FILE}, which home did not hand`
    )
  })

  it("is refused when its picture is of another address or moment than the scene says", async () => {
    const later = "2026-11-22T09:00:00.000Z"
    const cut = await showing([page(undefined, { capturedAt: later })])
    const drawn = resolveScreens(cut, handed([run()]))
    expect(drawn.ok ? "" : drawn.problems.join("\n")).toContain(
      `C1: it shows ${URL_3376} as of ${later}, and ${FILE} is ${URL_3376} as of ${AT}`
    )
  })

  it("takes the same moment however it is written", async () => {
    const cut = await showing([
      page(undefined, { capturedAt: "2026-11-21T23:02:11Z" }),
    ])
    expect(resolveScreens(cut, handed([run()])).ok).toBe(true)
  })

  it("is only an address anyone can open: https, with no user or password", () => {
    expect(isPublicAddress(URL_3376)).toBe(true)
    expect(isPublicAddress("http://github.com/paulgsc")).toBe(false)
    expect(isPublicAddress("https://me:token@github.com/paulgsc")).toBe(false)
    expect(isPublicAddress("https://token@github.com/paulgsc")).toBe(false)
  })

  it("is refused for a part it doesn't name", async () => {
    const cut = await showing([page(["logs"])])
    const drawn = resolveScreens(cut, handed([run()]))
    expect(drawn.ok ? "" : drawn.problems.join("\n")).toContain(
      `C1: the page ${FILE} names no logs`
    )
  })

  it("is refused in a cut list for an address that isn't public https", async () => {
    const cut = await showcase("rust-scratchpad")
    const raw = {
      ...cut,
      shots: cut.shots.map((shot, i) =>
        i === 1
          ? {
              ...shot,
              picture: {
                kind: "screen",
                of: page(undefined, { url: "http://192.168.1.10/home" }),
              },
            }
          : shot
      ),
    }
    expect(parseCardsEssay("rust-scratchpad-2026-11-14", raw).ok).toBe(false)
  })
})

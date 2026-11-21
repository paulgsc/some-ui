import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isSnipId, SnipRecordSchema } from "@some-ui/video-render/snip"
import { expect, describe as group, it } from "vitest"

import type { Part, SnipRecord } from "@/lib/snips"
import {
  APK_VIEWPORT,
  checksumsOf,
  describe,
  fillPattern,
  isStage,
  manifestOf,
  moduleOf,
  parseRouteTree,
  pathOf,
  PER_PATTERN,
  routesFor,
  slugOf,
  snipId,
  STAGE_ROUTES,
  tabBar,
  WEB_VIEWPORTS,
  wingPath,
} from "@/lib/snips"

const TREE = readFileSync(
  join(import.meta.dirname, "../../../routeTree.gen.ts"),
  "utf8"
)

group("the routes a capture visits", () => {
  const routes = parseRouteTree(TREE)
  const paths = (surface: "apk" | "web"): Array<string> =>
    routesFor(surface, routes).map((r) => r.path)

  it("reads every address once, layouts folded into their pages", () => {
    const all = routes.map((r) => r.path)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain("/")
    expect(all).toContain("/journal")
    expect(all).toContain("/jobs/pick/$day/$pickId")
    expect(all.every((p) => !p.includes("/_"))).toBe(true)
  })

  it("never visits home's own pages, which hold the owner's data", () => {
    const lan = routes.filter((r) => r.audience === "lan").map((r) => r.path)
    expect(lan).toContain("/lessons")
    for (const path of lan) {
      expect(paths("web")).not.toContain(path)
      expect(paths("apk")).not.toContain(path)
    }
  })

  it("visits the phone's pages only on the APK", () => {
    expect(paths("apk")).toContain("/journal/takes/kept")
    expect(paths("web")).not.toContain("/journal/takes/kept")
    expect(paths("web")).toContain("/mission")
    // RR31's card stage, whose parts (`data-region`) a snip's zoom names.
    expect(paths("web")).toContain("/rust-screen")
    expect(paths("apk")).toContain("/mission")
  })

  it("names an address by its route id", () => {
    expect(pathOf("/_dashboard/_apk/journal/")).toBe("/journal")
    expect(pathOf("/_dashboard/_apk/aph/history")).toBe("/aph/history")
    expect(pathOf("/")).toBe("/")
  })

  it("refuses a tree it cannot read", () => {
    expect(() => parseRouteTree("export const nothing = 1")).toThrow()
  })
})

group("the recording stages, taken whole", () => {
  it("are every route whose search is a stage's, and no other", () => {
    const dir = join(import.meta.dirname, "../../../routes")
    const stages = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .filter((text) => /validateSearch:\s*stageSearch\b/.test(text))
      .map((text) => /createFileRoute\("([^"]+)"\)/.exec(text)?.[1])
    expect(new Set(stages)).toEqual(new Set(STAGE_ROUTES))
    expect(isStage("/rust-screen")).toBe(true)
    expect(isStage("/journal")).toBe(false)
  })
})

group("filling a $param route from the links on screen", () => {
  it("takes the matching links, sorted, at most PER_PATTERN", () => {
    const links = [
      "/journal/asks/b",
      "/journal/asks/a/",
      "/journal/asks",
      "/journal/asks/a/deeper",
      "/journal/asks/d",
      "/journal/asks/c",
    ]
    expect(fillPattern("/journal/asks/$ask", links)).toEqual(
      ["/journal/asks/a", "/journal/asks/b", "/journal/asks/c"].slice(
        0,
        PER_PATTERN
      )
    )
  })

  it("fills nothing when no screen links to one", () => {
    expect(fillPattern("/jobs/pick/$day/$pickId", ["/jobs"])).toEqual([])
  })
})

group("a snip's names", () => {
  const sha256 = "0123456789abcdef".repeat(4)

  it("puts the surface, address, size, version and content hash in the id", () => {
    expect(
      snipId({
        surface: "apk",
        path: "/journal",
        viewport: APK_VIEWPORT.name,
        appVersion: "0.1.69",
        sha256,
      })
    ).toBe("apk:/journal:android:0.1.69:0123456789ab")
  })

  it("files an address under a flat name", () => {
    expect(slugOf("/")).toBe("front")
    expect(slugOf("/journal/takes/kept")).toBe("journal~takes~kept")
  })

  it("says what it shows in plain words", () => {
    const desktop = WEB_VIEWPORTS[0]
    expect(describe("Studio", "Takes", desktop)).toBe(
      "Studio: Takes, on a desktop browser, with sample data."
    )
    expect(describe("Studio", "", desktop)).toBe(
      "Studio, on a desktop browser, with sample data."
    )
    expect(moduleOf("/journal/takes")).toBe("Studio")
    expect(moduleOf("/somewhere-new")).toBe("somewhere-new")
    expect(moduleOf(wingPath("Studio", "Takes"))).toBe("Studio")
    expect(moduleOf(wingPath("app"))).toBe("Foyer")
  })
})

group("the bundle", () => {
  const snip = (id: string, version = "0.1.69"): SnipRecord => ({
    id,
    surface: "web",
    build: "release",
    route: "/",
    path: "/",
    viewport: "desktop",
    width: 1440,
    height: 900,
    scale: 1,
    regions: [],
    appVersion: version,
    module: "Front page",
    shows: "Front page",
    description: "Front page, on a desktop browser, with sample data.",
    image: { name: `${id}.png`, kind: "png", bytes: 1, sha256: "a" },
  })
  const part = (snips: Array<SnipRecord>, version = "0.1.69"): Part => ({
    surface: "web",
    appVersion: version,
    snips,
    unreached: [
      {
        surface: "web",
        route: "/captions",
        why: "it sends a visitor on to /burn-ins",
      },
    ],
  })
  const run = { commit: "c0ffee", url: "https://example.invalid/run" }

  it("joins the parts, sorted by id, one line per unreached route", () => {
    const manifest = manifestOf([part([snip("b")]), part([snip("a")])], run)
    expect(manifest.snips.map((s) => s.id)).toEqual(["a", "b"])
    expect(manifest.unreached).toHaveLength(1)
    expect(manifest.data).toBe("sample")
    expect(manifest.schema).toBe("some-ui.snips/1")
  })

  it("refuses an APK picture that isn't the emulator's size, as a default device draws", () => {
    const small: SnipRecord = {
      ...snip("apk:/journal:android:0.1.69:aaaaaaaaaaaa"),
      surface: "apk",
      width: 320,
      height: 640,
    }
    expect(() => manifestOf([part([small])], run)).toThrow(
      /is 320x640, not the emulator's 1080x1920/
    )
  })

  it("refuses two app versions, and two snips with one id", () => {
    expect(() =>
      manifestOf([part([snip("a")]), part([snip("b", "0.2.0")], "0.2.0")], run)
    ).toThrow(/2 app versions/)
    expect(() => manifestOf([part([snip("a"), snip("a")])], run)).toThrow(
      /two snips/
    )
  })

  it("names a release picture by the debug route that drew the same screen", () => {
    const debug = (sha: string, path: string): SnipRecord => ({
      ...snip(`apk:${path}:android:0.1.69:${sha}`),
      surface: "apk",
      width: 1080,
      height: 1920,
      build: "debug",
      route: path,
      path,
      image: { name: `debug-${sha}.png`, kind: "png", bytes: 1, sha256: sha },
    })
    const release = (sha: string): SnipRecord => ({
      ...snip(`apk:${wingPath("Studio", "Takes")}:android:0.1.69:${sha}`),
      surface: "apk",
      width: 1080,
      height: 1920,
      build: "release",
      route: wingPath("Studio", "Takes"),
      path: wingPath("Studio", "Takes"),
      image: { name: `release-${sha}.png`, kind: "png", bytes: 1, sha256: sha },
    })
    const manifest = manifestOf(
      [
        part([release("aaa"), release("bbb")]),
        part([debug("aaa", "/settings/home"), debug("ccc", "/foyer")]),
      ],
      run
    )
    expect(manifest.snips.map((s) => [s.build, s.path, s.image.name])).toEqual([
      ["release", "@studio/takes", "release-bbb.png"],
      ["debug", "/foyer", "debug-ccc.png"],
      ["release", "/settings/home", "release-aaa.png"],
    ])
  })

  it("writes checksums as sha256sum reads them", () => {
    expect(
      checksumsOf([
        { name: "web/b.png", sha256: "22" },
        { name: "manifest.json", sha256: "11" },
      ])
    ).toBe("11  manifest.json\n22  web/b.png\n")
  })
})

group("every name the capture makes is one the record takes", () => {
  const sha256 = "0123456789ab".padEnd(64, "f")
  const paths = [
    "/",
    "/journal/takes/voice%20note",
    "/journal/episodes/feed/key+1",
    "/a/b@c",
    "/%ED%95%9C",
    "/jobs/a:b",
    wingPath("app"),
    wingPath("Studio", "Takes"),
    wingPath("Topik", "단어"),
  ]

  it.each(paths)("%s", (path) => {
    const id = snipId({
      surface: "apk",
      path,
      viewport: APK_VIEWPORT.name,
      appVersion: "0.1.69",
      sha256,
    })
    expect(isSnipId(id)).toBe(true)
    const parsed = SnipRecordSchema.safeParse({
      id,
      surface: "apk",
      build: "release",
      route: path,
      path,
      viewport: APK_VIEWPORT.name,
      width: 1080,
      height: 1920,
      scale: 1,
      regions: [],
      appVersion: "0.1.69",
      module: moduleOf(path),
      shows: "",
      description: "",
      image: {
        name: `apk/android/${slugOf(path)}-${sha256.slice(0, 12)}.png`,
        kind: "png",
        bytes: 1,
        sha256,
      },
    })
    expect(parsed.error?.issues ?? []).toEqual([])
  })
})

group("the release APK's tab bar (#3137, option (b))", () => {
  const node = (
    label: string,
    x: number,
    over: Partial<{ y: number; bottom: number; selected: boolean }> = {}
  ): {
    label: string
    x: number
    y: number
    bottom: number
    selected: boolean
  } => ({ label, x, y: 1770, bottom: 1820, selected: false, ...over })
  // The shell's pill floats ~31 px above the app's foot (mobile-shell).
  const at = {
    appBottom: 1851,
    screenHeight: 1920,
    rowPx: 24,
  }
  const labels = (nodes: ReadonlyArray<{ label: string }>): Array<string> =>
    nodes.map((n) => n.label)

  it("is the floating row at the foot of what the app draws, however close its tabs", () => {
    // Studio's bar: two tabs about 500 px apart on a 1080 px screen.
    expect(
      labels(tabBar([node("Game day", 790), node("Studio", 290)], at))
    ).toEqual(["Studio", "Game day"])
  })

  it("is a row with a tab selected, wherever it sits", () => {
    const raised = { y: 1650, bottom: 1690 }
    expect(
      labels(
        tabBar(
          [
            node("Study", 300, { ...raised, selected: true }),
            node("Bites", 700, raised),
          ],
          at
        )
      )
    ).toEqual(["Study", "Bites"])
  })

  it("is not two buttons far above the foot, none chosen", () => {
    const raised = { y: 1650, bottom: 1690 }
    expect(
      tabBar([node("Older", 200, raised), node("Newer", 880, raised)], at)
    ).toEqual([])
  })

  it("is found with the page running on under the pill", () => {
    // A list item shows in the gap below the floating bar; the walk passes
    // only labelled controls in a row, so the bar is still the lowest row
    // of two or more.
    expect(
      labels(
        tabBar(
          [
            node("Studio", 290),
            node("Game day", 790),
            node("A take of 2 November", 540, { y: 1840, bottom: 1851 }),
          ],
          at
        )
      )
    ).toEqual(["Studio", "Game day"])
  })

  it("is not one control alone", () => {
    expect(tabBar([node("Studio", 540)], at)).toEqual([])
  })
})

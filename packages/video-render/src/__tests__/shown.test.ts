/** Our own surfaces are shown, not described (#3476, SHOW1). */
import type { CutList, Shot } from "@video-render/cut-list"
import { surfacesSpoken, unshownProblems } from "@video-render/shown"
import { cutList, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const SNIP = "apk:/studio/takes:studio:1.0.0:0123456789ab" as const

/** A scene saying `narration`, opening a chapter when `chapter` is given. */
const said = (
  id: string,
  narration: string,
  over: Partial<Shot> & { readonly chapter?: string } = {}
): Shot => {
  const { chapter, ...rest } = over
  return shot(id, {
    picture: { kind: "card" },
    spoken: {
      role: "scene",
      narration,
      ...(chapter === undefined ? {} : { chapter }),
    },
    ...rest,
  })
}

const screen: Shot["picture"] = {
  kind: "screen",
  of: { from: "snips", id: SNIP, commit: "a".repeat(40), at: [] },
}

describe("a line that speaks of our app", () => {
  it("places something on the phone, the APK, the web app or in Studio", () => {
    for (const line of [
      "Every Monday, a new week arrives on the phone.",
      "That is what the phone shows: error E0507, underlined.",
      "Watch it in Studio, under Renders.",
      "In Studio, under Renders, it waits.",
      "Studio’s Renders list holds it.",
      "Its answers stay in the APK until they're sent.",
      "Open it in the web app.",
    ])
      expect([line, [...surfacesSpoken(said("S", line))]]).toEqual([
        line,
        ["app"],
      ])
  })

  it("isn't one that names the phone for something else, or YouTube's Studio", () => {
    for (const line of [
      "The phone asks home at slash compat.",
      "A release of www, the web app, went out without its renderer.",
      "Set the thumbnail in YouTube Studio, under its upload page.",
      "YouTube Studio's upload page is by hand.",
      "Android Studio's emulator boots it.",
    ])
      expect([line, [...surfacesSpoken(said("S", line))]]).toEqual([line, []])
  })

  it("cites a file that draws one of its screens", () => {
    const cite = (path: string): Shot =>
      shot("S", {
        picture: { kind: "card" },
        spoken: {
          role: "scene",
          narration: "The take is laid at its place.",
          sources: [{ repo: "paulgsc/some-ui", path, lines: [1, 2] }],
        },
      })
    expect([
      ...surfacesSpoken(cite("packages/ui/soundbites/src/lib/x/take.tsx")),
    ]).toEqual(["app"])
    expect([...surfacesSpoken(cite("apps/www/src/routes/studio.tsx"))]).toEqual(
      ["app"]
    )
    expect([
      ...surfacesSpoken(cite("packages/ui/soundbites/src/__tests__/a.tsx")),
    ]).toEqual([])
    expect([...surfacesSpoken(cite("packages/video-render/src/x.ts"))]).toEqual(
      []
    )
  })
})

describe("a chapter that speaks of our app", () => {
  it("shows a screen of it somewhere in the chapter", () => {
    const cut = cutList([
      said("L1", "A week arrives on the phone.", { chapter: "Chapter one." }),
      said("L2", "Here it is.", { picture: screen }),
      said("L3", "It compiles on home.", { chapter: "Chapter two." }),
    ])
    expect(unshownProblems(cut)).toEqual([])
  })

  it("is refused once, at its first such scene, when it shows only cards", () => {
    const cut = cutList([
      said("L1", "A week arrives on the phone.", { chapter: "Chapter one." }),
      said("L2", "The phone shows the ticket.", { picture: screen }),
      said("L3", "Answers stay on the phone.", { chapter: "Chapter two." }),
      said("L4", "The phone shows the error."),
    ])
    expect(unshownProblems(cut)).toEqual([
      "L3: it speaks of our app and its chapter shows none: show it as a snip, a clip frame or a walk through the app, not a card (SHOW1)",
    ])
  })

  it("is shown by a walk through the app (#3476)", () => {
    const walk: Shot["picture"] = {
      kind: "screen",
      of: { from: "walks", run: "45321427650", app: "rust-rounds" },
    }
    const cut = cutList([
      said("L1", "A week arrives on the phone.", { picture: walk }),
    ])
    expect(unshownProblems(cut)).toEqual([])
  })

  it("isn't shown by a public page", () => {
    const page: Shot["picture"] = {
      kind: "screen",
      of: {
        from: "pages",
        url: "https://github.com/paulgsc/some-ui/pull/1",
        capturedAt: "2026-11-24T00:00:00Z",
        file: "pull-1-0123456789ab.png",
        run: "1",
        at: [],
      },
    }
    const cut = cutList([
      said("L1", "A week arrives on the phone.", { picture: page }),
    ])
    expect(unshownProblems(cut)).toHaveLength(1)
  })
})

/** A walk scene's picture: `app`'s walk in Snips Capture run 1. */
const walk = (app: string): Shot["picture"] => ({
  kind: "screen",
  of: { from: "walks", run: "1", app },
})

describe("a chapter that speaks of our dashboards (C1481)", () => {
  it("names Grafana or a dashboard, or cites the server's dashboards", () => {
    for (const line of [
      "Grafana shows it in the app.",
      "The weekly call's row in Grafana has no failed video.",
    ])
      expect([line, [...surfacesSpoken(said("S", line))]]).toEqual([
        line,
        ["dashboard"],
      ])
    const cited = shot("S", {
      picture: { kind: "card" },
      spoken: {
        role: "scene",
        narration: "Its rows are code.",
        sources: [
          {
            repo: "paulgsc/server",
            path: "infra/grafana/dashboards/call.jsonnet",
            lines: [1, 2],
          },
        ],
      },
    })
    expect([...surfacesSpoken(cited)]).toEqual(["dashboard"])
  })

  it("isn't a line naming another's dashboard", () => {
    for (const line of [
      "Deploy it from Cloudflare's dashboard.",
      "The Play Console dashboard lists the release.",
    ])
      expect([line, [...surfacesSpoken(said("S", line))]]).toEqual([line, []])
  })

  it("shows a walk of the Grafana stage, and only that", () => {
    const chapter = (picture: Shot["picture"]): CutList =>
      cutList([
        said("D1", "Grafana shows no failure.", { chapter: "Grafana." }),
        said("D2", "Here it is.", { picture }),
      ])
    expect(unshownProblems(chapter(walk("home-call")))).toEqual([])
    for (const other of [walk("rust-rounds"), screen])
      expect(unshownProblems(chapter(other))).toEqual([
        "D1: it speaks of our dashboard and its chapter shows none: show it as a walk of the dashboards (home-call, home-pipelines, home-pressure), not a card (SHOW1)",
      ])
  })

  it("never shows the app by a walk of the dashboards", () => {
    const cut = cutList([
      said("A1", "A week arrives on the phone.", { chapter: "One." }),
      said("A2", "Here it is.", { picture: walk("home-call") }),
    ])
    expect(unshownProblems(cut)).toHaveLength(1)
    expect(
      unshownProblems(
        cutList([
          said("A1", "A week arrives on the phone.", { chapter: "One." }),
          said("A2", "Here it is.", { picture: walk("rust-rounds") }),
        ])
      )
    ).toEqual([])
  })
})

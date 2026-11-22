/**
 * The landing's show (C1180, C1181, C1183): the script checked against the
 * walkthroughs it reads, the keys its faces are found by, and what each
 * producer makes for it.
 */
import type { Show, WalkthroughCopy } from "@/landing/show"
import {
  faceKey,
  facesToMake,
  isWalkthroughCopy,
  resolveShow,
  SHOW,
  SHOW_SCHEMA,
} from "@/landing/show"
import { describe, expect, it } from "vitest"

const WALK: WalkthroughCopy = {
  captions: ["One|two", "Three", "Four", "Five"],
  chapters: [
    { title: "First", from: 0, narration: ["Line one.", "Line two."] },
    { title: "Second|half", from: 2, narration: ["Line three."] },
  ],
}

const showOf = (scenes: Show["episodes"][number]["scenes"]): Show => ({
  schema: SHOW_SCHEMA,
  episodes: [
    { id: "android", kicker: "K", title: "T", walkthrough: "jobs", scenes },
  ],
})

const walks = { jobs: WALK, "home-server": WALK }

describe("resolveShow", () => {
  it("takes a scene's copy from its chapter, and a still's label from its caption", () => {
    const got = resolveShow(
      showOf([
        {
          copy: { chapter: 1 },
          faces: [{ snip: 3 }, { cut: "stop-2", label: "Moving" }],
        },
      ]),
      walks
    )
    expect(got).toEqual({
      ok: true,
      episodes: [
        {
          id: "android",
          kicker: "K",
          title: "T",
          scenes: [
            {
              title: "Second half",
              narration: ["Line three."],
              draft: false,
              faces: [
                { key: "stills/android/03.png", label: "Four" },
                { key: "clips/android/stop-2.mp4", label: "Moving" },
              ],
            },
          ],
        },
      ],
    })
  })

  it("refuses a still outside its chapter's own screens, and a chapter that isn't there", () => {
    const got = resolveShow(
      showOf([
        { copy: { chapter: 0 }, faces: [{ snip: 3 }, { snip: 1 }] },
        { copy: { chapter: 5 }, faces: [{ snip: 1 }, { snip: 2 }] },
      ]),
      walks
    )
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.problems).toEqual([
      "android scene 1 shows still 3, outside its chapter's screens",
      "android scene 2 names a chapter its walkthrough lacks",
    ])
  })

  it("marks a scene that writes its own words as the owner's to read", () => {
    const got = resolveShow(
      showOf([
        {
          copy: { title: "Own", narration: ["Said here."], draft: true },
          faces: [{ media: "stills/cores.png", label: "A" }, { snip: 4 }],
        },
      ]),
      walks
    )
    expect(got.ok && got.episodes[0]?.scenes[0]?.draft).toBe(true)
  })

  it("resolves the landing's own show, its drafts the scenes with no walkthrough chapter", () => {
    const drafts = SHOW.episodes.flatMap((e) =>
      e.scenes.flatMap((s, i) =>
        "chapter" in s.copy ? [] : [`${e.id} ${String(i + 1)}`]
      )
    )
    expect(drafts).toEqual([
      "extensions 1",
      "extensions 2",
      "extensions 3",
      "server 3",
    ])
  })
})

describe("faceKey and facesToMake", () => {
  it("finds a still by its walk's number, a cut by its shot, an asset by its key", () => {
    expect(faceKey("server", { snip: 4 })).toBe("stills/server/04.png")
    expect(faceKey("android", { cut: "stop-1", label: "x" })).toBe(
      "clips/android/stop-1.mp4"
    )
    expect(faceKey("server", { media: "stills/cores.png", label: "x" })).toBe(
      "stills/cores.png"
    )
  })

  it("lists the stills and cuts each producer makes, and nothing named by key", () => {
    const android = facesToMake(SHOW, "android")
    expect(android.cuts.map((c) => c.shot)).toEqual([
      "stop-1",
      "stop-2",
      "stop-3",
      "stop-4",
    ])
    expect(android.stills.map((s) => s.snip)).toEqual([2, 4, 9, 15])
    const extensions = facesToMake(SHOW, "extensions")
    expect(extensions.cuts.map((c) => c.shot)).toEqual(["hook", "feature"])
    expect(extensions.stills.map((s) => s.key)).toEqual([
      "stills/extensions/01.png",
      "stills/extensions/02.png",
    ])
    // The server's stills come from home (the mailbox), not a producer here.
    expect(facesToMake(SHOW, "server").cuts).toEqual([])
  })
})

describe("isWalkthroughCopy", () => {
  it("takes a walkthrough's fill and refuses anything else", () => {
    expect(isWalkthroughCopy(WALK)).toBe(true)
    expect(isWalkthroughCopy({ chapters: [], captions: [1] })).toBe(false)
    expect(
      isWalkthroughCopy({ chapters: [{ title: "x", from: 0 }], captions: [] })
    ).toBe(false)
    expect(isWalkthroughCopy(null)).toBe(false)
  })
})

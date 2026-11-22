/**
 * The landing's show (C1180, C1181, C1183): the script checked against the
 * walkthroughs it reads, the keys its faces are found by, and what each
 * producer makes for it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Show, WalkthroughCopy } from "@/landing/show"
import {
  faceKey,
  facesToMake,
  isWalkthroughCopy,
  publicEpisodes,
  resolveShow,
  SHOW,
  SHOW_SCHEMA,
} from "@/landing/show"
import { describe, expect, it } from "vitest"

/** A walkthrough's copy from its file in the repo. */
function walkthroughAt(path: string): WalkthroughCopy {
  const read: unknown = JSON.parse(
    readFileSync(join(import.meta.dirname, "../../../../..", path), "utf8")
  )
  const fill =
    typeof read === "object" && read !== null && "fill" in read
      ? read.fill
      : undefined
  if (!isWalkthroughCopy(fill)) throw new Error(`${path} is not a walkthrough`)
  return fill
}

const WALK: WalkthroughCopy = {
  captions: ["One|two", "Three", "Four", "Five"],
  chapters: [
    { title: "First", from: 0, narration: ["Line one.", "Line two."] },
    { title: "Second|half", from: 2, narration: ["Line three."] },
  ],
}

/** A show of `scenes` as its Android episode, beside a one-scene server episode. */
const showOf = (scenes: Show["episodes"][number]["scenes"]): Show => ({
  schema: SHOW_SCHEMA,
  episodes: [
    { id: "android", kicker: "K", title: "T", walkthrough: "jobs", scenes },
    {
      id: "server",
      kicker: "S",
      title: "U",
      walkthrough: "home-server",
      scenes: [{ copy: { chapter: 0 }, faces: [{ snip: 1 }, { snip: 2 }] }],
    },
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
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.episodes[0]).toEqual({
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

  it("refuses an empty line of copy, and a show of one episode", () => {
    const empty = resolveShow(
      showOf([
        {
          copy: { title: "Own", narration: ["Said.", " "], draft: true },
          faces: [{ snip: 1 }, { snip: 2 }],
        },
      ]),
      walks
    )
    expect(empty.ok ? [] : empty.problems).toEqual([
      "android scene 1 has an empty line of copy",
    ])
    const both = showOf([
      { copy: { chapter: 0 }, faces: [{ snip: 1 }, { snip: 2 }] },
    ])
    const one = resolveShow(
      { ...both, episodes: both.episodes.slice(1) },
      walks
    )
    expect(one.ok ? [] : one.problems).toEqual([
      "the show needs two episodes or more",
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
    expect(drafts).toEqual(["extensions 1", "extensions 2", "extensions 3"])
  })
})

describe("the landing's own show", () => {
  const resolved = resolveShow(SHOW, {
    jobs: walkthroughAt("apps/www/tests/walk/jobs-walkthrough.json"),
    "home-server": walkthroughAt(
      "packages/video-motion/walks/home-server.json"
    ),
  })

  it("resolves against the walkthroughs in the repo", () => {
    expect(resolved.ok ? [] : resolved.problems).toEqual([])
  })

  it("leaves the owner's unread scenes off the public site, and shows them in a preview", () => {
    if (!resolved.ok) throw new Error("unresolved")
    const shown = publicEpisodes(resolved.episodes, false)
    expect(shown.flatMap((e) => e.scenes).some((s) => s.draft)).toBe(false)
    // The extensions' scenes are all drafts, so the episode waits whole.
    expect(shown.map((e) => e.id)).toEqual(["android", "server"])
    expect(publicEpisodes(resolved.episodes, true)).toBe(resolved.episodes)
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

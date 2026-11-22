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
  resolveShow,
  SHOW,
  SHOW_SCHEMA,
  showFor,
  slotOf,
  WALKTHROUGH_FILES,
} from "@/landing/show"
import { describe, expect, it } from "vitest"

/** A file in the repo, parsed, as the build reads a walkthrough. */
const repoRead = (path: string): unknown =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, "../../../../..", path), "utf8")
  )

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
            {
              key: "stills/android/03.png",
              label: "Four",
              slot: "still",
            },
            {
              key: "clips/android/stop-2.mp4",
              label: "Moving",
              slot: "clip",
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

  it("refuses an empty line of copy, a show of one episode, and an episode named twice", () => {
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
    const twice = resolveShow(
      { ...both, episodes: [...both.episodes, ...both.episodes.slice(1)] },
      walks
    )
    expect(twice.ok ? [] : twice.problems).toEqual([
      "the show names an episode twice",
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
  it("resolves against the walkthroughs the build reads", () => {
    const show = showFor(SHOW, repoRead, true)
    expect(show.ok ? [] : show.problems).toEqual([])
  })

  it("leaves the owner's unread scenes off the public site, and shows them in a preview", () => {
    const pages = showFor(SHOW, repoRead, false)
    const preview = showFor(SHOW, repoRead, true)
    if (!pages.ok || !preview.ok) throw new Error("unresolved")
    expect(pages.episodes.flatMap((e) => e.scenes).some((s) => s.draft)).toBe(
      false
    )
    // The extensions' scenes are all drafts, so the episode waits whole.
    expect(pages.episodes.map((e) => e.id)).toEqual(["android", "server"])
    expect(preview.episodes.map((e) => e.id)).toEqual([
      "extensions",
      "android",
      "server",
    ])
    expect(pages.drafts).toBe(3)
  })
})

describe("showFor", () => {
  const reads =
    (fill: unknown) =>
    (path: string): unknown =>
      path === WALKTHROUGH_FILES.jobs ? { fill } : { fill: WALK }

  it("refuses a walkthrough that doesn't give the landing its words", () => {
    for (const fill of [
      { chapters: [], captions: [1] },
      { chapters: [{ title: "x", from: 0 }], captions: [] },
      null,
    ]) {
      const show = showFor(
        showOf([{ copy: { chapter: 0 }, faces: [{ snip: 1 }, { snip: 2 }] }]),
        reads(fill),
        false
      )
      expect(show.ok ? [] : show.problems).toEqual([
        `${WALKTHROUGH_FILES.jobs} is not a walkthrough's words`,
      ])
    }
  })

  it("refuses a public site left with one episode once drafts are out", () => {
    const own = {
      copy: { title: "Mine", narration: ["Words."], draft: true },
      faces: [
        { media: "stills/a.png", label: "A" },
        { media: "stills/b.png", label: "B" },
      ],
    } as const
    const show: Show = {
      schema: SHOW_SCHEMA,
      episodes: [
        {
          id: "extensions",
          kicker: "K",
          title: "T",
          walkthrough: null,
          scenes: [own],
        },
        ...showOf([
          { copy: { chapter: 0 }, faces: [{ snip: 1 }, { snip: 2 }] },
        ]).episodes.slice(0, 1),
      ],
    }
    expect(showFor(show, reads(WALK), true).ok).toBe(true)
    const pages = showFor(show, reads(WALK), false)
    expect(pages.ok ? [] : pages.problems).toEqual([
      "fewer than two episodes are left to show once drafts are left out",
    ])
    // Agreed, it shows.
    const agreed: Show = {
      ...show,
      episodes: [
        {
          ...show.episodes[0],
          scenes: [{ ...own, copy: { ...own.copy, draft: false } }],
        },
        ...show.episodes.slice(1),
      ],
    }
    expect(showFor(agreed, reads(WALK), false).ok).toBe(true)
  })
})

describe("slotOf", () => {
  it("fills a clip's slot for a cut, and a still's for a still or an asset", () => {
    expect(slotOf({ cut: "hook", label: "x" })).toBe("clip")
    expect(slotOf({ snip: 1 })).toBe("still")
    expect(slotOf({ media: "stills/a.png", label: "x" })).toBe("still")
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

/**
 * The landing's show (C1180, C1181, C1183): the script checked against the
 * walkthroughs it reads, the keys its faces are found by, and what each
 * producer makes for it.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { drawSnacks, shuffle } from "@/landing/draw"
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
import { timedScenes } from "@/landing/timeline"
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
      pool: null,
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

  it("resolves the landing's own show, its drafts the scenes and snacks with no walkthrough chapter", () => {
    for (const e of SHOW.episodes) {
      const scenes = "pool" in e.scenes ? e.scenes.pool : e.scenes
      for (const s of scenes)
        expect("chapter" in s.copy ? false : s.copy.draft).toBe(
          !("chapter" in s.copy)
        )
    }
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
    // The extensions' three scenes, and every snack of the Android pool
    // written for the landing rather than taken from its walkthrough.
    const android = SHOW.episodes.find((e) => e.id === "android")?.scenes
    const own =
      android !== undefined && "pool" in android
        ? android.pool.filter((s) => !("chapter" in s.copy)).length
        : 0
    expect(pages.drafts).toBe(3 + own)
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

  it("agrees with the key every face of the show is found by: a clip's an .mp4, a still's a .png", () => {
    // The build reads each file by its key's extension (render-public-site's
    // mediaFor, and its sound refusal for a clip), so a slot and its key
    // must name the same thing.
    const show = showFor(SHOW, repoRead, true)
    if (!show.ok) throw new Error("unresolved")
    for (const face of show.episodes.flatMap((e) =>
      e.scenes.flatMap((scene) => scene.faces)
    ))
      expect(face.key, face.slot).toMatch(
        face.slot === "clip" ? /\.mp4$/ : /\.png$/
      )
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
    expect(faceKey("android", { screen: "/settings/data", label: "x" })).toBe(
      "stills/android/screens/settings~data.png"
    )
  })

  it("lists the stills and cuts each producer makes, and nothing named by key", () => {
    const android = facesToMake(SHOW, "android")
    expect(android.cuts.map((c) => c.shot).sort()).toEqual([
      "stop-1",
      "stop-2",
      "stop-3",
      "stop-4",
    ])
    expect(android.stills.map((s) => s.snip)).toEqual([
      7, 8, 9, 11, 13, 2, 4, 15,
    ])
    expect(android.screens.map((s) => s.route)).toContain("/rust-rounds")
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

/** A random source that gives `values` in turn, then 0. */
const randomOf = (values: ReadonlyArray<number>): (() => number) => {
  let at = 0
  return () => values[at++] ?? 0
}

describe("shuffle", () => {
  it("swaps each place with one drawn at or below it (Fisher-Yates)", () => {
    // i = 3 swaps with j = floor(0.5 * 4) = 2 (a b d c); i = 2 with 0
    // (d b a c); i = 1 with floor(0.99 * 2) = 1, itself.
    expect(shuffle(["a", "b", "c", "d"], randomOf([0.5, 0, 0.99]))).toEqual([
      "d",
      "b",
      "a",
      "c",
    ])
  })

  it("keeps every item once, and leaves its input as it was", () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const got = shuffle(items, Math.random)
    expect([...got].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it("stays inside the array when the random source gives 1", () => {
    expect(shuffle(["a", "b", "c"], () => 1)).toEqual(["a", "b", "c"])
  })

  it("draws every order of three about equally often", () => {
    // A seeded source (a linear congruential generator), so the count is the same every run.
    let seed = 7
    const seeded = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
      return seed / 2 ** 31
    }
    const counts = new Map<string, number>()
    for (let n = 0; n < 6000; n++) {
      const order = shuffle(["a", "b", "c"], seeded).join("")
      counts.set(order, (counts.get(order) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1150)
    }
  })
})

describe("an episode's pool", () => {
  const snack = (title: string, draft: boolean) =>
    ({
      copy: { title, narration: [`${title}, said.`], draft },
      faces: [{ snip: 1 }, { snip: 2 }],
      from: ["#3473"],
    }) as const

  it("shows its first draw with no script, and keeps every snack to draw from", () => {
    const got = resolveShow(
      showOf({
        draw: 2,
        pool: [snack("A", false), snack("B", false), snack("C", false)],
      }),
      walks
    )
    if (!got.ok) throw new Error(got.problems.join("; "))
    const android = got.episodes.at(0)
    expect(android?.scenes.map((s) => s.title)).toEqual(["A", "B"])
    expect(android?.pool?.snacks.map((s) => s.title)).toEqual(["A", "B", "C"])
    expect(android?.pool?.draw).toBe(2)
  })

  it("refuses a pool with no more snacks than it draws", () => {
    const got = resolveShow(
      showOf({ draw: 2, pool: [snack("A", false), snack("B", false)] }),
      walks
    )
    expect(got.ok ? [] : got.problems).toEqual([
      "android draws 2 from a pool of 2: a pool needs more snacks than it draws",
    ])
  })

  it("refuses a picture labelled two ways", () => {
    const got = resolveShow(
      showOf({
        draw: 1,
        pool: [
          { ...snack("A", false), faces: [{ snip: 1 }, { snip: 2 }] },
          {
            ...snack("B", false),
            faces: [{ snip: 1, label: "Else" }, { snip: 2 }],
          },
        ],
      }),
      walks
    )
    expect(got.ok ? [] : got.problems).toEqual([
      'stills/android/01.png is labelled both "One two" and "Else"',
    ])
  })

  it("leaves a draft snack off the public site, the first draw taken from the rest", () => {
    const show = showOf({
      draw: 1,
      pool: [snack("Draft", true), snack("Read", false), snack("Too", false)],
    })
    const read = (): unknown => ({ fill: WALK })
    const pages = showFor(show, read, false)
    if (!pages.ok) throw new Error(pages.problems.join("; "))
    expect(pages.episodes[0]?.scenes.map((s) => s.title)).toEqual(["Read"])
    expect(pages.episodes[0]?.pool?.snacks.map((s) => s.title)).toEqual([
      "Read",
      "Too",
    ])
    expect(pages.drafts).toBe(1)
  })

  it("turns a pool left with no more than it draws into fixed scenes, in its order", () => {
    const show = showOf({
      draw: 2,
      pool: [snack("Draft", true), snack("Read", false), snack("Too", false)],
    })
    const pages = showFor(show, (): unknown => ({ fill: WALK }), false)
    if (!pages.ok) throw new Error(pages.problems.join("; "))
    expect(pages.episodes[0]?.scenes.map((s) => s.title)).toEqual([
      "Read",
      "Too",
    ])
    expect(pages.episodes[0]?.pool).toBeNull()
  })

  it("draws `draw` snacks of a pool, each once, by their places in it", () => {
    // 0 1 2 3 4 → 0 1 4 3 2 → 3 1 4 0 2 → (2 stays) → 1 3 4 0 2.
    expect(drawSnacks(5, 3, randomOf([0.5, 0, 0.99, 0]))).toEqual([1, 3, 4])
    for (let n = 0; n < 50; n++) {
      const drawn = drawSnacks(5, 3, Math.random)
      expect(drawn).toHaveLength(3)
      expect(new Set(drawn).size).toBe(3)
    }
  })

  it("rests every snack of the landing's own pools on the record: each file it names exists", () => {
    for (const e of SHOW.episodes) {
      if (!("pool" in e.scenes)) continue
      expect(e.scenes.pool.length).toBeGreaterThan(e.scenes.draw)
      for (const s of e.scenes.pool)
        for (const source of s.from)
          if (source.includes("/") || source.endsWith(".md"))
            expect(
              existsSync(join(import.meta.dirname, "../../../../..", source)),
              source
            ).toBe(true)
    }
  })
})

describe("timedScenes", () => {
  it("times each place of a pool for its longest title and its longest line at each place", () => {
    const got = resolveShow(
      showOf({
        draw: 2,
        pool: [
          {
            copy: { title: "Short", narration: ["a"], draft: false },
            faces: [{ snip: 1 }, { snip: 2 }],
            from: ["#3473"],
          },
          {
            copy: {
              title: "The longest",
              narration: ["bb", "a second line"],
              draft: false,
            },
            faces: [{ snip: 1 }, { snip: 2 }],
            from: ["#3473"],
          },
          {
            copy: { title: "Mid", narration: ["ccc"], draft: false },
            faces: [{ snip: 1 }, { snip: 2 }],
            from: ["#3473"],
          },
        ],
      }),
      walks
    )
    if (!got.ok) throw new Error(got.problems.join("; "))
    const android = got.episodes.at(0)
    const server = got.episodes.at(1)
    if (android === undefined || server === undefined) throw new Error("none")
    const timed = timedScenes(android)
    expect(timed.map((s) => [s.title, s.narration])).toEqual([
      ["The longest", ["ccc", "a second line"]],
      ["The longest", ["ccc", "a second line"]],
    ])
    expect(timedScenes(server)).toBe(server.scenes)
  })
})

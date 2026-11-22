/**
 * The landing's show (C1180, C1181): "What I built and use every day" as a
 * script, an episode a project, each a few scenes. A scene's copy streams
 * into the copy block, then the episode's two cubes turn to the scene's two
 * faces, which show what the copy just said. The owner (C1180): "the
 * rotations aren't just for the sake of rotations."
 *
 * A scene's copy is a chapter of the episode's walkthrough
 * (`some-ui.walkthrough/1`, `@some-ui/video-motion`), its title and
 * narration, written once for the walkthrough video and read here; an
 * episode with no walkthrough writes its scenes here (`draft` until the
 * owner has read them). A face is a member of the landing's one slot family
 * (`faceKey`): a still from the episode's walk, a silent cut of its rendered
 * video by shot, or an asset by key. Pure: `resolveShow` checks the script
 * against the chapters and gives what `render.ts` draws.
 */

/** The episodes, by project. */
export type EpisodeId = "extensions" | "android" | "server"

/** A walkthrough chapter as the landing reads it: its title and narration. */
type Chapter = {
  readonly title: string
  readonly from: number
  readonly narration: ReadonlyArray<string>
}

/** What a walkthrough gives the landing: its chapters and its screens' captions. */
export type WalkthroughCopy = {
  readonly chapters: ReadonlyArray<Chapter>
  readonly captions: ReadonlyArray<string>
}

/** Whether `value` holds a walkthrough's chapters and captions, as the landing reads them. */
function isWalkthroughCopy(value: unknown): value is WalkthroughCopy {
  if (typeof value !== "object" || value === null) return false
  if (!("chapters" in value) || !("captions" in value)) return false
  const { chapters, captions } = value
  return (
    Array.isArray(captions) &&
    captions.every((c: unknown) => typeof c === "string") &&
    Array.isArray(chapters) &&
    chapters.every(
      (c: unknown) =>
        typeof c === "object" &&
        c !== null &&
        "title" in c &&
        typeof c.title === "string" &&
        "from" in c &&
        typeof c.from === "number" &&
        "narration" in c &&
        Array.isArray(c.narration) &&
        c.narration.every((l: unknown) => typeof l === "string")
    )
  )
}

/**
 * A face of a cube: a still from the episode's walk by its 1-based number
 * (`snips/NN.png`), a silent cut of the episode's rendered video by shot id
 * (`shot-times.json`), or an asset by key. Its band names it by `label`; a
 * still's label defaults to its walkthrough caption.
 */
export type Face = FaceKinds[keyof FaceKinds]

/** The kinds of face, each named by the one field that sets it apart. */
type FaceKinds = {
  readonly snip: { readonly snip: number; readonly label?: string }
  readonly cut: { readonly cut: string; readonly label: string }
  readonly media: {
    readonly media: `stills/${string}.png`
    readonly label: string
  }
}

/**
 * What a face's slot stands as while it is on its way (C1185): the frame of
 * a clip, or of a still, so the reader is told honestly what is coming.
 */
export type FaceSkeleton = "clip" | "still"

/** Each kind of face's skeleton: a new kind can't be a face until it names one. */
const SKELETONS: { readonly [K in keyof FaceKinds]: FaceSkeleton } = {
  snip: "still",
  cut: "clip",
  media: "still",
}

/** The skeleton `face` stands as before it arrives, by its kind. */
export function faceSkeleton(face: Face): FaceSkeleton {
  for (const [kind, skeleton] of Object.entries(SKELETONS))
    if (kind in face) return skeleton
  throw new Error("a face of no kind")
}

/** A scene's copy: a chapter of the episode's walkthrough, or its own words. */
type SceneCopy =
  | { readonly chapter: number }
  | {
      readonly title: string
      readonly narration: ReadonlyArray<string>
      /**
       * Drafted for the owner to read: shown only in a preview on their
       * machine until they agree it, when this turns false (C1181).
       */
      readonly draft: boolean
    }

type Scene = {
  readonly copy: SceneCopy
  /** The left cube's face, then the right cube's. */
  readonly faces: readonly [Face, Face]
}

/** A cube has four faces, so an episode has one to four scenes. */
type Scenes =
  | readonly [Scene]
  | readonly [Scene, Scene]
  | readonly [Scene, Scene, Scene]
  | readonly [Scene, Scene, Scene, Scene]

type Episode = {
  readonly id: EpisodeId
  /** The copy block's label for the episode, and its heading. */
  readonly kicker: string
  readonly title: string
  /** The walkthrough its chapters come from, by app; none: its scenes write their own. */
  readonly walkthrough: "jobs" | "home-server" | null
  readonly scenes: Scenes
}

export const SHOW_SCHEMA = "some-ui.landing-show/1"

export type Show = {
  readonly schema: typeof SHOW_SCHEMA
  readonly episodes: ReadonlyArray<Episode>
}

export const SHOW: Show = {
  schema: SHOW_SCHEMA,
  episodes: [
    {
      id: "extensions",
      kicker: "In my browser",
      title: "Two extensions I wrote for myself",
      walkthrough: null,
      scenes: [
        {
          copy: {
            title: "Suspender Ledger",
            narration: [
              "Suspender Ledger is my TypeScript port of auto-tab-discard, for the tabs I leave open in Firefox.",
              "From its popup I can suspend a tab I've left idle, or tell it never to suspend a site.",
            ],
            draft: true,
          },
          faces: [
            { snip: 1, label: "The popup, on a tab left idle" },
            { snip: 2, label: "Never suspend this site" },
          ],
        },
        {
          copy: {
            title: "Signed by Mozilla",
            narration: [
              "Mozilla's add-on reviewers approved it and signed it, on their unlisted channel: it has no public listing.",
            ],
            draft: true,
          },
          faces: [
            { cut: "hook", label: "Signed on AMO" },
            { cut: "feature", label: "The popup, at work" },
          ],
        },
        {
          copy: {
            title: "Page Filter",
            narration: [
              "Page Filter is the extension I use most: it darkens the pages I read at night.",
            ],
            draft: true,
          },
          faces: [
            {
              media: "stills/page-filter/before.png",
              label: "A page as it comes",
            },
            {
              media: "stills/page-filter/after.png",
              label: "The same page, filtered",
            },
          ],
        },
      ],
    },
    {
      id: "android",
      kicker: "On my phone",
      title: "Jobs, in my Android app",
      walkthrough: "jobs",
      scenes: [
        {
          copy: { chapter: 0 },
          faces: [
            { cut: "stop-1", label: "This morning's picks" },
            { snip: 2 },
          ],
        },
        {
          copy: { chapter: 1 },
          faces: [{ cut: "stop-2", label: "Applying" }, { snip: 4 }],
        },
        {
          copy: { chapter: 2 },
          faces: [{ cut: "stop-3", label: "The interview week" }, { snip: 9 }],
        },
        {
          copy: { chapter: 3 },
          faces: [{ cut: "stop-4", label: "The record" }, { snip: 15 }],
        },
      ],
    },
    {
      id: "server",
      kicker: "At home",
      title: "file_host, the server behind them",
      walkthrough: "home-server",
      scenes: [
        { copy: { chapter: 0 }, faces: [{ snip: 1 }, { snip: 2 }] },
        { copy: { chapter: 1 }, faces: [{ snip: 4 }, { snip: 5 }] },
      ],
    },
  ],
}

/** A still's or cut's file name: its number, two digits, as a walk names it. */
const two = (n: number): string => String(n).padStart(2, "0")

/** Where the build finds a face's asset (output.ts, `SITE_MEDIA_DIR`), by key. */
export function faceKey(episode: EpisodeId, face: Face): string {
  if ("snip" in face) return `stills/${episode}/${two(face.snip)}.png`
  if ("cut" in face) return `clips/${episode}/${face.cut}.mp4`
  return face.media
}

/** A face as the landing draws it: its asset's key, its band's label, and its skeleton. */
export type ResolvedFace = {
  readonly key: string
  readonly label: string
  readonly skeleton: FaceSkeleton
}

/** A scene as the landing draws it: its copy, resolved, and its two faces. */
type ResolvedScene = {
  readonly title: string
  readonly narration: ReadonlyArray<string>
  readonly draft: boolean
  readonly faces: readonly [ResolvedFace, ResolvedFace]
}

export type ResolvedEpisode = {
  readonly id: EpisodeId
  readonly kicker: string
  readonly title: string
  readonly scenes: ReadonlyArray<ResolvedScene>
}

/** A caption on one line: a walkthrough splits its drawn lines on "|". */
const oneLine = (caption: string): string =>
  caption
    .split("|")
    .map((part) => part.trim())
    .join(" ")

/**
 * The show with every scene's copy and every face's label filled in from the
 * episodes' walkthroughs, or every problem that stops it: a chapter the
 * walkthrough lacks, a still outside its chapter's own screens (so a face
 * always shows what its copy names), a still with no caption and no label,
 * an empty line of copy, or a show of fewer than two episodes (the copy
 * block turns between them).
 */
export function resolveShow(
  show: Show,
  walkthroughs: Readonly<Record<"jobs" | "home-server", WalkthroughCopy>>
):
  | { readonly ok: true; readonly episodes: ReadonlyArray<ResolvedEpisode> }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> } {
  const problems: Array<string> = []
  const episodes = show.episodes.map((episode): ResolvedEpisode => {
    const words =
      episode.walkthrough === null ? null : walkthroughs[episode.walkthrough]
    const scenes = episode.scenes.map((scene, s): ResolvedScene => {
      const where = `${episode.id} scene ${String(s + 1)}`
      let title = ""
      let narration: ReadonlyArray<string> = []
      let range: readonly [number, number] | null = null
      if ("chapter" in scene.copy) {
        const chapter = words?.chapters[scene.copy.chapter]
        if (words === null || chapter === undefined) {
          problems.push(`${where} names a chapter its walkthrough lacks`)
        } else {
          title = chapter.title
          narration = chapter.narration
          const next = words.chapters.at(scene.copy.chapter + 1)
          range = [chapter.from, next?.from ?? words.captions.length]
        }
      } else {
        title = scene.copy.title
        narration = scene.copy.narration
      }
      const face = (f: Face): ResolvedFace => {
        let label = f.label ?? ""
        if ("snip" in f) {
          const at = f.snip - 1
          if (range !== null && (at < range[0] || at >= range[1]))
            problems.push(
              `${where} shows still ${String(f.snip)}, outside its chapter's screens`
            )
          if (label === "") label = oneLine(words?.captions[at] ?? "")
          if (label === "")
            problems.push(
              `${where} shows still ${String(f.snip)} with no label`
            )
        }
        return {
          key: faceKey(episode.id, f),
          label: oneLine(label),
          skeleton: faceSkeleton(f),
        }
      }
      if (narration.some((line) => line.trim() === ""))
        problems.push(`${where} has an empty line of copy`)
      return {
        title: oneLine(title),
        narration,
        draft: "chapter" in scene.copy ? false : scene.copy.draft,
        faces: [face(scene.faces[0]), face(scene.faces[1])],
      }
    })
    return {
      id: episode.id,
      kicker: episode.kicker,
      title: episode.title,
      scenes,
    }
  })
  if (episodes.length < 2) problems.push("the show needs two episodes or more")
  return problems.length > 0 ? { ok: false, problems } : { ok: true, episodes }
}

/**
 * The episodes as the public site shows them: a scene the owner hasn't read
 * yet (`draft`) is left out, and an episode left with none goes with it.
 * A preview on the owner's machine shows them (`preview:pages`), so the
 * owner reads them where they will appear; a draft never reaches Pages.
 */
function publicEpisodes(
  episodes: ReadonlyArray<ResolvedEpisode>,
  withDrafts: boolean
): ReadonlyArray<ResolvedEpisode> {
  if (withDrafts) return episodes
  return episodes.flatMap((episode) => {
    const scenes = episode.scenes.filter((scene) => !scene.draft)
    return scenes.length === 0 ? [] : [{ ...episode, scenes }]
  })
}

/** Each walkthrough the show reads, by app, as a path from the repository's root. */
export const WALKTHROUGH_FILES = {
  jobs: "apps/www/tests/walk/jobs-walkthrough.json",
  "home-server": "packages/video-motion/walks/home-server.json",
} as const satisfies Readonly<Record<"jobs" | "home-server", string>>

/**
 * The show as a build gives it: each walkthrough read through `read` (a
 * path from `WALKTHROUGH_FILES` to its parsed JSON) and checked for the
 * fields the landing reads (its `fill`; the walkthrough's own schema,
 * `@some-ui/video-motion`, holds the rest where the video is made), the
 * show resolved against them, and its drafts left out unless `withDrafts`.
 * Refused when a walkthrough isn't one, the show doesn't resolve, or fewer
 * than two episodes are left to show.
 */
export function showFor(
  show: Show,
  read: (path: string) => unknown,
  withDrafts: boolean
):
  | {
      readonly ok: true
      readonly episodes: ReadonlyArray<ResolvedEpisode>
      /** The draft scenes the show has, shown or not. */
      readonly drafts: number
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> } {
  const words = (path: string): WalkthroughCopy | string => {
    const json = read(path)
    const fill =
      typeof json === "object" && json !== null && "fill" in json
        ? json.fill
        : undefined
    return isWalkthroughCopy(fill)
      ? fill
      : `${path} is not a walkthrough's words`
  }
  const jobs = words(WALKTHROUGH_FILES.jobs)
  const home = words(WALKTHROUGH_FILES["home-server"])
  if (typeof jobs === "string" || typeof home === "string")
    return {
      ok: false,
      problems: [jobs, home].filter((w) => typeof w === "string"),
    }
  const resolved = resolveShow(show, { jobs, "home-server": home })
  if (!resolved.ok) return resolved
  const episodes = publicEpisodes(resolved.episodes, withDrafts)
  if (episodes.length < 2)
    return {
      ok: false,
      problems: ["fewer than two episodes are left to show once drafts are"],
    }
  const drafts = resolved.episodes.reduce(
    (n, e) => n + e.scenes.filter((scene) => scene.draft).length,
    0
  )
  return { ok: true, episodes, drafts }
}

/** Every asset key the show names, once each. */
export function showMediaKeys(
  episodes: ReadonlyArray<ResolvedEpisode>
): ReadonlyArray<string> {
  return [
    ...new Set(
      episodes.flatMap((e) =>
        e.scenes.flatMap((s) => s.faces.map((f) => f.key))
      )
    ),
  ]
}

/**
 * What a producer makes for `episode` (C1183): each still it copies from its
 * walk's snips, and each cut it takes from its rendered video by shot, with
 * the key the landing finds it by. Faces named by key are made elsewhere.
 */
export function facesToMake(
  show: Show,
  episode: EpisodeId
): {
  readonly stills: ReadonlyArray<{
    readonly snip: number
    readonly key: string
  }>
  readonly cuts: ReadonlyArray<{ readonly shot: string; readonly key: string }>
} {
  const faces = show.episodes
    .filter((e) => e.id === episode)
    .flatMap((e) => e.scenes.flatMap((s) => [...s.faces]))
  const stills = new Map<string, number>()
  const cuts = new Map<string, string>()
  for (const face of faces) {
    if ("snip" in face) stills.set(faceKey(episode, face), face.snip)
    else if ("cut" in face) cuts.set(faceKey(episode, face), face.cut)
  }
  return {
    stills: [...stills].map(([key, snip]) => ({ snip, key })),
    cuts: [...cuts].map(([key, shot]) => ({ shot, key })),
  }
}

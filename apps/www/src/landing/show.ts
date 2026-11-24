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
import type { FileRoutesByFullPath } from "@/routeTree.gen"

import { COPY_FACES } from "./timeline.ts"

/** A path with an index's trailing `/` dropped, as Snips Capture names a route (`pathOf`). */
type Address<P extends string> = P extends `${infer Head}/`
  ? Head extends ""
    ? P
    : Head
  : P

/**
 * An app route, as the router knows it (the generated route tree's own
 * union) and as the snips bundle records it: a typo fails to compile.
 */
type Route = Address<keyof FileRoutesByFullPath & `/${string}`>

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
 * (`shot-times.json`), a still of one of the app's routes as Snips Capture
 * photographed it on sample data (`docs/snips.md`, #3473), or an asset by
 * key. Its band names it by `label`; a walk still's label defaults to its
 * walkthrough caption.
 */
export type Face = FaceKinds[keyof FaceKinds]

/**
 * The kinds of face, each named by the one field that sets it apart, which
 * is how `slotOf` tells them apart.
 */
type FaceKinds = {
  readonly snip: { readonly snip: number; readonly label?: string }
  readonly cut: { readonly cut: string; readonly label: string }
  /** A route by its path, as the router knows it: a typo fails to compile. */
  readonly screen: { readonly screen: Route; readonly label: string }
  readonly media: {
    readonly media: `stills/${string}.png`
    readonly label: string
  }
}

/**
 * What a slot of the landing holds (C1185): a clip, which plays, or a
 * still. A face's slot says both how its asset is drawn and what its
 * skeleton promises before it arrives, so those two cannot disagree; that it
 * matches its key's extension, which the build reads files by, is a test's
 * (show.test).
 */
export type SlotKind = "clip" | "still"

/**
 * Each kind of face's slot. A new kind can't be a face until it names one
 * here, and it can name one only if it carries its own name as a field and
 * no other kind's (`slotOf` tells kinds apart by that one field); any other
 * kind's entry must be `never`, which no slot is.
 */
const SLOTS: {
  readonly [K in keyof FaceKinds]: K extends keyof FaceKinds[K]
    ? [Exclude<keyof FaceKinds, K> & keyof FaceKinds[K]] extends [never]
      ? SlotKind
      : never
    : never
} = {
  snip: "still",
  cut: "clip",
  screen: "still",
  media: "still",
}

/** The slot `face` fills, by its kind. */
export function slotOf(face: Face): SlotKind {
  for (const [kind, slot] of Object.entries(SLOTS))
    if (kind in face) return slot
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

type PanelScene = {
  readonly copy: SceneCopy
  /** The left cube's face, then the right cube's. */
  readonly faces: readonly [Face, Face]
}

/**
 * A grouping's whole row of one of the server's dashboards (C1441, C1443):
 * by its number in the episode's rows walk (`home-server-rows`, its
 * `stills/<episode>/rows/NN.png`), and the caption that names it.
 */
type RowShot = { readonly row: number; readonly label: string }

/**
 * A scene whose grouping is a dashboard's row: its two faces are a phone's
 * (and the cubes'), and its row is the wide screen's, on the dashboard band
 * under the stage (C1443).
 */
type RowScene = PanelScene & { readonly row: RowShot }

/** A scene: two faces, and, where it is a dashboard's grouping, its row. */
type Scene = PanelScene | RowScene

/** A cube has four faces, so an episode shows one to four scenes. */
type Scenes =
  | readonly [Scene]
  | readonly [Scene, Scene]
  | readonly [Scene, Scene, Scene]
  | readonly [Scene, Scene, Scene, Scene]

/**
 * Where a snack's words come from in the repo's own record: an issue or a
 * pull request by number, a call by ID, or a file by its path from the
 * repository's root. The show's test holds each path to a file that exists.
 */
type Source = `#${number}` | `C${number}` | `${string}/${string}` | "CLAUDE.md"

/**
 * A snack (#3473): a scene in an episode's pool, a short true line and its
 * two faces, with where its words come from.
 */
type Snack = Scene & { readonly from: readonly [Source, ...Array<Source>] }

/** How many scenes a page shows of a pool: a cube's faces at most. */
type DrawSize = 1 | 2 | 3 | 4

/**
 * An episode's pool (#3473): more snacks than a page shows, fixed when the
 * site is built. Each visit draws `draw` of them (`drawSnacks`); a page
 * read with no script shows the first `draw`, in order.
 */
type Pool = { readonly pool: ReadonlyArray<Snack>; readonly draw: DrawSize }

type Episode = {
  readonly id: EpisodeId
  /** The copy block's label for the episode, and its heading. */
  readonly kicker: string
  readonly title: string
  /** The walkthrough its chapters come from, by app; none: its scenes write their own. */
  readonly walkthrough: "jobs" | "home-server" | null
  /** Its scenes, the same each visit, or a pool each visit draws from. */
  readonly scenes: Scenes | Pool
}

/** An episode's scenes as one list: its scenes, or every snack of its pool. */
export const scenesOf = (episode: Episode): ReadonlyArray<Scene> =>
  "pool" in episode.scenes ? episode.scenes.pool : episode.scenes

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
      title: "The Android app I built for myself",
      walkthrough: "jobs",
      // A pool (#3473, C1440).
      scenes: {
        draw: 4,
        pool: [
          {
            copy: {
              title: "Coming back is what adds up",
              narration: [
                "I don't claim an exercise teaches me anything. I claim that coming back does.",
                "When I skip practising something, the app's own friction is one reason I can name, so I work on that.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/practice", label: "Practice Home" },
              { screen: "/rust-rounds", label: "Rust Rounds" },
            ],
            from: ["#2533", "#3473"],
          },
          {
            copy: {
              title: "Rust Rounds keeps my eye sharp",
              narration: [
                "I barely write code by hand now. Rust Rounds keeps my eye for Rust sharp.",
                "Each week brings an invented company, a user story with its deadline, and two to four tickets.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/rust-rounds", label: "Rust Rounds" },
              { screen: "/practice", label: "Practice Home" },
            ],
            from: ["#2231"],
          },
          {
            copy: {
              title: "Studio: my intuition, scaffolded",
              narration: [
                "Studio makes video essays. I bring the skeleton of an intuition, and an agent scaffolds the rest.",
                "I'm the audience, not the author or the voice.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/journal/intuitions", label: "Intuitions" },
              { screen: "/journal/episodes", label: "Episodes" },
            ],
            from: ["#3473", "#2643"],
          },
          {
            copy: {
              title: "A practice interview, once a week",
              narration: [
                "My interview muscle is weak, and I don't train it. So the phone sets me a practice week.",
                "The job and the company are invented: no real employer is named.",
              ],
              draft: false,
            },
            faces: [
              { cut: "stop-3", label: "The interview week" },
              { snip: 7 },
            ],
            from: ["#3473", "#2931"],
          },
          {
            copy: {
              title: "Korean, one press away",
              narration: [
                "My Korean stopped for days. One reason: a lesson was nine presses away.",
                "Now a lesson is a press or two from Practice Home, with three waiting unopened.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/practice", label: "Practice Home" },
              { screen: "/settings/data/word-sets", label: "Word sets" },
            ],
            from: ["#2090"],
          },
          {
            copy: {
              title: "Each question is a ladder",
              narration: [
                "Read a good answer, read it aloud, say it from cues, then say it my way.",
              ],
              draft: false,
            },
            faces: [{ snip: 8 }, { snip: 9 }],
            from: ["#2931", "apps/www/src/lib/interview-week/words.ts"],
          },
          {
            copy: {
              title: "The questions I find hardest",
              narration: [
                "“Tell me about yourself” and “tell me about a time…” are the ones I find hardest, so the week practises them.",
                "Questions about my decisions come from my own pull requests: why I chose one thing over another.",
              ],
              draft: false,
            },
            faces: [
              {
                screen: "/jobs/interview/questions",
                label: "This week's questions",
              },
              { screen: "/jobs/interview/how", label: "How a week goes" },
            ],
            from: ["#2931"],
          },
          {
            copy: {
              title: "Said out loud, then played back",
              narration: [
                "I say each answer out loud, and the take is kept and played back before it goes.",
                "The week ends in a video essay on how I came across.",
              ],
              draft: false,
            },
            faces: [{ snip: 11 }, { snip: 13 }],
            from: ["#2931", "apps/www/src/lib/interview-week/words.ts"],
          },
          {
            copy: {
              title: "Not answering is an answer",
              narration: [
                "I talk each ticket through aloud, look my takes over, and send them together.",
                "The deadline is Sunday 23:59, and not answering is an answer.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/rust-rounds", label: "Rust Rounds" },
              { screen: "/journal/takes", label: "Takes" },
            ],
            from: ["#2231"],
          },
          {
            copy: {
              title: "When rustc says nothing",
              narration: [
                "Code that compiles is the interesting case, because rustc says nothing.",
                "My answer comes back as a video essay: my take, a best fit, and the gap between them.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/rust-rounds", label: "Rust Rounds" },
              { screen: "/journal/episodes", label: "Episodes" },
            ],
            from: ["#2231"],
          },
          {
            copy: {
              title: "The redo",
              narration: [
                "A chat tutor got four answers from me in two months, then silence. Rust Rounds is the redo.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/rust-rounds", label: "Rust Rounds" },
              { screen: "/practice", label: "Practice Home" },
            ],
            from: ["#2231"],
          },
          {
            copy: {
              title: "Portions, not minutes",
              narration: [
                "I pick a lesson by its size, from a bite to a dessert, never by minutes.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/practice", label: "Practice Home" },
              { screen: "/settings/data/word-sets", label: "Word sets" },
            ],
            from: ["#2090"],
          },
          {
            copy: {
              title: "Made from what I want to watch",
              narration: [
                "Without AI, the video I want exists only if someone happens to make it.",
                "Now it's made from my own intuition, scene by scene.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/journal/intuitions", label: "Intuitions" },
              { screen: "/journal/templates", label: "Templates" },
            ],
            from: ["#3473", "#2643"],
          },
          {
            copy: {
              title: "Takes catch the thought",
              narration: [
                "A take catches a thought the moment I have it. Working on it comes later.",
                "Said while the context is fresh, it's feedback for the work ahead.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/journal/takes", label: "Takes" },
              { screen: "/journal/feedback", label: "Feedback" },
            ],
            from: ["#3029"],
          },
          {
            copy: {
              title: "An essay instead of a memory",
              narration: [
                "From the phone I can ask for an essay on any epic or feature.",
                "So I don't have to hold how home deploys in my head.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/journal/templates", label: "Templates" },
              { screen: "/journal/episodes", label: "Episodes" },
            ],
            from: ["#2980"],
          },
          {
            copy: {
              title: "Every limit, in Settings",
              narration: [
                "A limit that could refuse my data should show in Settings, so nothing fails quietly.",
                "Word sets stopped at 50, and nothing said so until the 51st was refused.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/settings/phone", label: "Settings: Phone" },
              { screen: "/settings/data/word-sets", label: "Word sets" },
            ],
            from: ["#2107"],
          },
          {
            copy: {
              title: "My data, and one way to delete",
              narration: [
                "My data shows what I keep and where.",
                "Deleting a record for good goes one way, with a confirm and a receipt that stays.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/settings/data", label: "My data" },
              { screen: "/settings/data/deleted", label: "Deleted" },
            ],
            from: ["#2473", "CLAUDE.md"],
          },
          {
            copy: {
              title: "Absence counts",
              narration: [
                "Each app notes what it offered me, what I took, what I passed over, and when I came back.",
                "Not showing up counts too.",
              ],
              draft: false,
            },
            faces: [
              { screen: "/practice", label: "Practice Home" },
              { screen: "/settings/data", label: "My data" },
            ],
            from: ["#2533"],
          },
          {
            copy: { chapter: 0 },
            faces: [
              { cut: "stop-1", label: "This morning's picks" },
              { snip: 2 },
            ],
            from: ["apps/www/tests/walk/jobs-walkthrough.json"],
          },
          {
            copy: { chapter: 1 },
            faces: [{ cut: "stop-2", label: "Applying" }, { snip: 4 }],
            from: ["apps/www/tests/walk/jobs-walkthrough.json"],
          },
          {
            copy: { chapter: 2 },
            faces: [
              { cut: "stop-3", label: "The interview week" },
              { snip: 9 },
            ],
            from: ["apps/www/tests/walk/jobs-walkthrough.json"],
          },
          {
            copy: { chapter: 3 },
            faces: [{ cut: "stop-4", label: "The record" }, { snip: 15 }],
            from: ["apps/www/tests/walk/jobs-walkthrough.json"],
          },
        ],
      },
    },
    {
      id: "server",
      kicker: "At home",
      // Every visit draws four groupings in any order, so what holds for
      // all of them (code, sample data) is said here, not in one chapter.
      title: "file_host's dashboards: code, drawn on sample data",
      walkthrough: "home-server",
      // A pool of every grouping the owner named (C1441), a dashboard's row
      // each; the first four are the draw a page with no script shows.
      scenes: {
        draw: 4,
        pool: [
          {
            copy: { chapter: 0 },
            faces: [{ snip: 1 }, { snip: 2 }],
            row: {
              row: 1,
              label: "Health and golden signals, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 1 },
            faces: [{ snip: 3 }, { snip: 4 }],
            row: {
              row: 2,
              label: "Traffic, latency and errors, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 2 },
            faces: [{ snip: 5 }, { snip: 6 }],
            row: {
              row: 3,
              label:
                "What file_host asks the outside, on its outbound dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 3 },
            faces: [{ snip: 7 }, { snip: 8 }],
            row: {
              row: 4,
              label: "When the render may run, on the call's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 4 },
            faces: [{ snip: 9 }, { snip: 10 }],
            row: {
              row: 5,
              label: "What other work waits on, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 5 },
            faces: [{ snip: 11 }, { snip: 12 }],
            row: {
              row: 6,
              label:
                "What the services cost the host, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 6 },
            faces: [{ snip: 13 }, { snip: 14 }],
            row: {
              row: 7,
              label:
                "Who is connected over WebSocket, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
          {
            copy: { chapter: 7 },
            faces: [{ snip: 15 }, { snip: 16 }],
            row: {
              row: 8,
              label: "Rate limiting and refusals, on file_host's dashboard",
            },
            from: ["#3401", "C1441"],
          },
        ],
      },
    },
  ],
}

/** A still's or cut's file name: its number, two digits, as a walk names it. */
const two = (n: number): string => String(n).padStart(2, "0")

/** A route as a file's name: `/settings/data` is `settings~data`. */
const routeSlug = (route: Route): string => route.slice(1).replaceAll("/", "~")

/** Where the build finds a face's asset (output.ts, `SITE_MEDIA_DIR`), by key. */
export function faceKey(episode: EpisodeId, face: Face): string {
  if ("snip" in face) return `stills/${episode}/${two(face.snip)}.png`
  if ("cut" in face) return `clips/${episode}/${face.cut}.mp4`
  if ("screen" in face)
    return `stills/${episode}/screens/${routeSlug(face.screen)}.png`
  return face.media
}

/** Where the build finds a grouping's row (`RowShot`), by key. */
const rowKey = (episode: EpisodeId, row: RowShot): string =>
  `stills/${episode}/rows/${two(row.row)}.png`

/** A grouping's row as the landing draws it on the dashboard band: its key and its caption. */
export type ResolvedRow = { readonly key: string; readonly label: string }

/** A face as the landing draws it: its asset's key, its band's label, and its slot. */
export type ResolvedFace = {
  readonly key: string
  readonly label: string
  readonly slot: SlotKind
}

/** A scene as the landing draws it: its copy, resolved, and its two faces. */
export type ResolvedScene = {
  readonly title: string
  readonly narration: ReadonlyArray<string>
  readonly draft: boolean
  readonly faces: readonly [ResolvedFace, ResolvedFace]
  /** Its grouping's row for the dashboard band; none: a scene of two faces. */
  readonly row: ResolvedRow | null
}

/** A pool as the landing draws from it: every snack resolved, and how many a visit shows. */
type ResolvedPool = {
  readonly snacks: ReadonlyArray<ResolvedScene>
  readonly draw: DrawSize
}

export type ResolvedEpisode = {
  readonly id: EpisodeId
  readonly kicker: string
  readonly title: string
  /** What a page shows with no script: its scenes, or its pool's first draw. */
  readonly scenes: ReadonlyArray<ResolvedScene>
  /** Its pool, which a visit draws its scenes from; null: its scenes are fixed. */
  readonly pool: ResolvedPool | null
}

/** A pool's first draw, the one a page read with no script shows: its first `draw` snacks. */
const firstDraw = (pool: ResolvedPool): ReadonlyArray<ResolvedScene> =>
  pool.snacks.slice(0, pool.draw)

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
 * an empty line of copy, a picture labelled two ways, a pool with no more snacks than it draws (then
 * every visit shows them all, and they are scenes), a show of fewer than
 * two episodes (the copy block turns between them), or an episode named
 * twice.
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
    const pooled = "pool" in episode.scenes
    const scenes = scenesOf(episode).map((scene, s): ResolvedScene => {
      const where = `${episode.id} ${pooled ? "snack" : "scene"} ${String(s + 1)}`
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
          slot: slotOf(f),
        }
      }
      if (narration.some((line) => line.trim() === ""))
        problems.push(`${where} has an empty line of copy`)
      return {
        title: oneLine(title),
        narration,
        draft: "chapter" in scene.copy ? false : scene.copy.draft,
        faces: [face(scene.faces[0]), face(scene.faces[1])],
        row:
          "row" in scene
            ? { key: rowKey(episode.id, scene.row), label: scene.row.label }
            : null,
      }
    })
    // The band shows a row for every place of its episode, or none at all.
    const rowed = scenes.filter((scene) => scene.row !== null).length
    if (rowed !== 0 && rowed !== scenes.length)
      problems.push(
        `${episode.id} gives a dashboard row to ${String(rowed)} of its ${String(scenes.length)} scenes: all or none`
      )
    const head = {
      id: episode.id,
      kicker: episode.kicker,
      title: episode.title,
    }
    if (!("pool" in episode.scenes)) return { ...head, scenes, pool: null }
    const { draw } = episode.scenes
    if (scenes.length <= draw)
      problems.push(
        `${episode.id} draws ${String(draw)} from a pool of ${String(scenes.length)}: a pool needs more snacks than it draws`
      )
    const pool = { snacks: scenes, draw }
    return { ...head, scenes: firstDraw(pool), pool }
  })
  // A picture is one face wherever it shows: two labels on it would make
  // its band say two things of the same screen.
  const labels = new Map<string, string>()
  for (const face of episodes.flatMap((e) =>
    everyScene(e).flatMap((scene) => scene.faces)
  )) {
    const named = labels.get(face.key)
    if (named !== undefined && named !== face.label)
      problems.push(
        `${face.key} is labelled both "${named}" and "${face.label}"`
      )
    labels.set(face.key, named ?? face.label)
  }
  if (episodes.length < 2) problems.push("the show needs two episodes or more")
  // The copy block is a cube: an episode a face, so four at most.
  if (episodes.length > COPY_FACES)
    problems.push(`the show has room for ${String(COPY_FACES)} episodes`)
  // An episode a project, once each.
  const ids = show.episodes.map((episode) => episode.id)
  if (new Set(ids).size < ids.length)
    problems.push("the show names an episode twice")
  return problems.length > 0 ? { ok: false, problems } : { ok: true, episodes }
}

/**
 * The episodes as the public site shows them: a scene or snack the owner
 * hasn't read yet (`draft`) is left out, a pool draws from what is left,
 * and an episode left with none goes with it.
 * A preview on the owner's machine shows them (`preview:pages`), so the
 * owner reads them where they will appear; a draft never reaches Pages.
 */
function publicEpisodes(
  episodes: ReadonlyArray<ResolvedEpisode>,
  withDrafts: boolean
): ReadonlyArray<ResolvedEpisode> {
  if (withDrafts) return episodes
  return episodes.flatMap((episode): ReadonlyArray<ResolvedEpisode> => {
    const read = (s: ReadonlyArray<ResolvedScene>): Array<ResolvedScene> =>
      s.filter((scene) => !scene.draft)
    if (episode.pool === null) {
      const scenes = read(episode.scenes)
      return scenes.length === 0 ? [] : [{ ...episode, scenes }]
    }
    const pool = { ...episode.pool, snacks: read(episode.pool.snacks) }
    if (pool.snacks.length === 0) return []
    if (pool.snacks.length <= pool.draw)
      return [{ ...episode, scenes: pool.snacks, pool: null }]
    return [{ ...episode, scenes: firstDraw(pool), pool }]
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
      problems: [
        "fewer than two episodes are left to show once drafts are left out",
      ],
    }
  const drafts = resolved.episodes.reduce(
    (n, e) => n + everyScene(e).filter((scene) => scene.draft).length,
    0
  )
  return { ok: true, episodes, drafts }
}

/** Every scene an episode can show: its own, or each snack of its pool. */
export const everyScene = (
  episode: ResolvedEpisode
): ReadonlyArray<ResolvedScene> => episode.pool?.snacks ?? episode.scenes

/**
 * Every asset key the show names, once each: first what a page is built
 * with (each episode's scenes, a pool's first draw, which a reader with no
 * script always sees), then the rest of each pool. The build spends the
 * page's preview budget in this order (`render-public-site.ts`), so a face
 * on every page comes before a snack drawn now and then.
 */
export function showMediaKeys(
  episodes: ReadonlyArray<ResolvedEpisode>
): ReadonlyArray<string> {
  const keys = (scenes: ReadonlyArray<ResolvedScene>): Array<string> =>
    scenes.flatMap((s) => [
      ...s.faces.map((f) => f.key),
      ...(s.row === null ? [] : [s.row.key]),
    ])
  return [
    ...new Set([
      ...episodes.flatMap((e) => keys(e.scenes)),
      ...episodes.flatMap((e) => keys(everyScene(e))),
    ]),
  ]
}

/**
 * What a producer makes for `episode` (C1183): each still it copies from its
 * walk's snips, each cut it takes from its rendered video by shot, and each
 * route's still it copies from the capture's snips bundle (#3473), with the
 * key the landing finds it by. Faces named by key are made elsewhere.
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
  readonly screens: ReadonlyArray<{
    readonly route: string
    readonly key: string
  }>
  /** Each grouping's row, copied from the episode's rows walk's snips. */
  readonly rows: ReadonlyArray<{ readonly row: number; readonly key: string }>
} {
  const faces = show.episodes
    .filter((e) => e.id === episode)
    .flatMap((e) => scenesOf(e).flatMap((s) => [...s.faces]))
  const stills = new Map<string, number>()
  const cuts = new Map<string, string>()
  const screens = new Map<string, string>()
  for (const face of faces) {
    if ("snip" in face) stills.set(faceKey(episode, face), face.snip)
    else if ("cut" in face) cuts.set(faceKey(episode, face), face.cut)
    else if ("screen" in face) screens.set(faceKey(episode, face), face.screen)
  }
  const rows = new Map<string, number>()
  for (const e of show.episodes.filter((x) => x.id === episode))
    for (const scene of scenesOf(e))
      if ("row" in scene) rows.set(rowKey(episode, scene.row), scene.row.row)
  return {
    rows: [...rows].map(([key, row]) => ({ row, key })),
    stills: [...stills].map(([key, snip]) => ({ snip, key })),
    cuts: [...cuts].map(([key, shot]) => ({ shot, key })),
    screens: [...screens].map(([key, route]) => ({ route, key })),
  }
}

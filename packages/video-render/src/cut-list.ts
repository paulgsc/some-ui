/**
 * Cut list v2: the one file the phone, home and Claude all edit, and the
 * only thing the renderer reads about a video. Every duration is a number
 * someone wrote (the phone fits a scene to its take, `timing.ts`), and
 * every choice is a plan or an override from `vocabulary.ts`.
 *
 * Times are whole milliseconds. Paths are relative to the video's folder.
 * Takes, footage and backgrounds stay out of the repo (Drive, or home).
 */

import { z } from "zod"

import { badgeProblems } from "./badges"
import { ClaimSourcesSchema } from "./claims"
import { LOOKS, VOICES } from "./plans"
import {
  COMMIT,
  isPublicAddress,
  PAGE_FILE,
  RUN_ID,
  SNIP_ID,
  WALK_APP,
} from "./snip-id"
import { SPOKEN_CATEGORIES } from "./spoken-categories"
import { stampProblems } from "./stamp"
import {
  BackgroundSchema,
  CueSchema,
  increasing,
  MotionSchema,
  ms,
  MUSIC_MODES,
  path,
  TRANSITIONS,
} from "./vocabulary"

export const CUT_LIST_SCHEMA = "some-ui.cut-list/2"

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)

/** Where the capture sits in the window: the whole screen, or a crop of it. */
const FramingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full") }),
  z.object({
    mode: z.literal("crop"),
    /** Above 1 crops narrower than the screen. */
    zoom: z.number().min(1).max(4).default(1),
    /** The crop's left edge and top, in the capture's CSS px. */
    x: z.number().nonnegative().default(0),
    y: z.number().nonnegative().default(0),
  }),
])

const PictureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("capture"),
    source: path,
    inMs: ms.default(0),
    /** Plays to `outMs`, then holds that frame to the scene's end. */
    outMs: ms.optional(),
    speed: z.number().min(0.25).max(8).default(1),
    /** The screen's width in CSS px, to read `x`, `y` and pan heights. */
    cssWidth: z.number().int().positive().default(412),
    framing: FramingSchema.default({ mode: "crop", zoom: 1, x: 0, y: 0 }),
    /** When the recorder tapped, in ms into the scene. */
    taps: z
      .array(ms)
      .default([])
      .refine(increasing, { message: "taps move forward in time" }),
  }),
  z.object({ kind: z.literal("still"), source: path }),
  /**
   * A screen that home keeps or is handed (SNIPS4, #3114; C865): a snip of
   * the snip library by its id, a frame of the Clips Library by its
   * clip, side and file, or a public page by its address and capture. Home hands the ones an essay names, and
   * `resolveScreens` (`./snip`) draws each by the screen-zoom composition:
   * the whole screen held above the captions or, for a snip given `at`,
   * zoomed to those named parts in turn.
   * Unresolved, it refuses the render.
   */
  z.object({
    kind: z.literal("screen"),
    of: z.discriminatedUnion("from", [
      z.object({
        from: z.literal("snips"),
        id: z.string().regex(SNIP_ID, "it isn't a snip's id"),
        /**
         * The commit its bundle was captured at (`snips-bundle-<commit>`):
         * which bundle home fetches, and how the snip is made again
         * (SNIPS5, #3149; C868).
         */
        commit: z.string().regex(COMMIT, "a commit's 40 hex digits"),
        /** The parts to zoom to, in order, as the page names them (`data-region`). */
        at: z.array(z.string().min(1).max(200)).max(10).default([]),
      }),
      /**
       * A public page, photographed logged out (`./page`): a pull request's
       * checks, a run's jobs, a page of docs. Named by the address and the
       * moment its picture was taken, the "as of" a viewer is told, and its
       * file, which home hands beside the essay in `<key>.pages/`.
       */
      z.object({
        from: z.literal("pages"),
        url: z
          .string()
          .refine(
            isPublicAddress,
            "a public https address, with no user or password"
          ),
        capturedAt: z.iso.datetime(),
        file: z
          .string()
          .regex(PAGE_FILE, "a page's picture, <slug>-<hash12>.png"),
        /**
         * The Public Pages Capture run that took it (`pages-bundle-<run>`):
         * which bundle home fetches, as a snip's commit is (#3395). A page
         * taken again is a new picture, so a lost bundle is a new run and
         * the scene names that one.
         */
        run: z.string().regex(RUN_ID, "a capture run's id, in digits"),
        /** The parts to zoom to, in order, as the capture named them. */
        at: z.array(z.string().min(1).max(200)).max(10).default([]),
      }),
      /**
       * A walk of the app (`./walk`, #3476): the screens a scripted walk
       * left on the emulator, played in turn with a ring on each tap. Named
       * by the Snips Capture run that walked it (`walks-bundle-<run>`), its
       * app, and the steps it plays, from 1, both ends kept: the whole walk
       * when absent.
       */
      z.object({
        from: z.literal("walks"),
        run: z.string().regex(RUN_ID, "a capture run's id, in digits"),
        app: z.string().regex(WALK_APP, "a walk's app, a slug"),
        steps: z
          .tuple([z.number().int().min(1), z.number().int().min(1)])
          .refine(([first, last]) => first <= last, {
            message: "its first step comes before its last",
          })
          .optional(),
      }),
      z.object({
        from: z.literal("clips"),
        clip: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "a clip's id"),
        side: z.enum(["before", "after"]),
        /** The frame's name, as home keeps a side's frames (`frameName`). */
        file: z.string().regex(/^[a-z0-9][a-z0-9._-]*\.png$/, "a PNG frame"),
      }),
    ]),
  }),
  /** The series' ground alone, for a card burn-in to draw on. */
  z.object({ kind: z.literal("card") }),
  /**
   * A HyperFrames composition (HYPER2, #2725), drawn over the whole frame for
   * the scene's length: one of `@some-ui/video-motion`'s, by its folder's
   * name. It draws its own motion, and its own way in and out.
   */
  z.object({
    kind: z.literal("composition"),
    ref: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    /** Its inputs, over its declared defaults; one it doesn't declare is refused. */
    variables: z.record(z.string(), z.unknown()).default({}),
    /** Files in the video's folder it reads, beside it as `assets/<file>`. */
    files: z.array(path).default([]),
  }),
])

/** A burn-in's kind and design, as names (`@some-ui/burn-ins` knows them). */
export const BurnInKindSchema = z.string().regex(/^[a-z][a-z-]{0,31}$/)
export const BurnInDesignSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)

/**
 * A layer code draws into the frame (STUDIO ST15): its kind, the frozen
 * design it is drawn in, and this video's data for it. A burn-in that names
 * no design is drawn in the one its series version names for the kind
 * (ST11, `resolve.ts`). The burn-ins workspace validates `params`; the
 * renderer only passes them on.
 */
export const BurnInSchema = z.object({
  kind: BurnInKindSchema,
  design: BurnInDesignSchema.optional(),
  params: z.record(z.string(), z.unknown()).default({}),
})

/**
 * Whose words an idea came from, when they were the owner's (ST16): an
 * `idea` is one answer of a video idea the owner caught (ST18, ST19), as
 * `<idea id>/<answer>`.
 */
const OwnerRefSchema = z.object({
  kind: z.enum(["note", "take", "voice-note", "prompt", "idea"]),
  id: z.string().min(1).max(200),
})

/**
 * Whose idea a scene presents (STUDIO ST16): the owner's, which must cite
 * the owner's own words it came from, an agent's, or a source's, which must
 * cite it. A scene that says nothing is an agent's: nothing claims the idea
 * for the owner without a citation (`authorship.ts`).
 */
export const IdeaSchema = z.discriminatedUnion("origin", [
  z.object({ origin: z.literal("you"), from: OwnerRefSchema }),
  z.object({ origin: z.literal("agent") }),
  z.object({
    origin: z.literal("source"),
    from: z.object({ title: z.string().min(1), ref: z.string().min(1) }),
  }),
])

/** A word said, and when, in ms: what home's speaker gives (`/timed`). */
export const TimedWordSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})

export type TimedWord = Readonly<z.infer<typeof TimedWordSchema>>

/**
 * The most characters home's speaker says in one line: it refuses a longer
 * one (paulgsc/server `infra/kokoro/say.py`, `MOST_CHARS`).
 */
export const SAY_MOST_CHARS = 4_000

/**
 * A line home's Kokoro speaker can say: some words, no longer than it takes,
 * with at least one letter or digit, since a line of punctuation alone gives
 * it nothing to say and it refuses it (`say.py`'s "nothing to say").
 */
export const SayableSchema = z
  .string()
  .trim()
  .min(1, "it says nothing")
  .max(
    SAY_MOST_CHARS,
    `home's speaker says at most ${SAY_MOST_CHARS} characters in one line`
  )
  .refine((text) => /[\p{L}\p{N}]/u.test(text), {
    message: "it has no letter or digit, so the speaker has nothing to say",
  })

/**
 * A take's id as home keeps it, as the Rust essay's opening names one, and
 * never with a dot first, which the takes folder would read as hidden.
 */
export const SPOKEN_TAKE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

/**
 * The most exchanges a spoken card plays (C813): the owner's introduction
 * runs three to five (who I am, why synthetic voices, what AI-generated
 * means here, why Rust Rounds, why on the phone), so six, past the
 * opening's three. Policy, moved with the story (C771).
 */
export const SPOKEN_EXCHANGES_MOST = 6

/**
 * One turn of a spoken card's exchange, in one of its two voices (owner,
 * 2026-11-20): a line home's Kokoro says, or a take of the owner's that home
 * keeps, by its id (TAKES path A). Either may ask and either may answer:
 * an introduction has Kokoro ask and the owner answer, and the DB essay the
 * other way round.
 */
export const SpokenTurnSchema = z.discriminatedUnion("voice", [
  z.strictObject({ voice: z.literal("kokoro"), said: SayableSchema }),
  z.strictObject({
    voice: z.literal("owner"),
    take: z
      .string()
      .regex(SPOKEN_TAKE_ID, "it isn't a take's id, as home keeps it"),
  }),
])

export type SpokenTurn = z.infer<typeof SpokenTurnSchema>

/**
 * What a spoken cards essay says over a scene (EXPLAIN6, #3021): the essay's
 * intro, a scene's chapter line (its chapter's first scene only, C1027)
 * and then its narration, or the close. The
 * recorder has home's speaker say each (`cards-essay.ts`, `record:cards`).
 * Each but a spoken card may name the code it describes (`sources`, #3036),
 * which `render cards-check` holds to the stamp's commits (`claims.ts`).
 */
export const SpokenSchema = z.discriminatedUnion("role", [
  /** What the essay is for, what you'll be able to do, and what it is as of. */
  z.strictObject({
    role: z.literal("intro"),
    said: SayableSchema,
    sources: ClaimSourcesSchema.optional(),
  }),
  /**
   * Where this step sits and why it matters, then what the card teaches,
   * and the code its narration describes (#3036, `claims.ts`).
   * Only a chapter's first scene says its chapter line and marks it; a
   * scene without one goes on in the chapter before it (C1027).
   */
  z.strictObject({
    role: z.literal("scene"),
    chapter: SayableSchema.optional(),
    narration: SayableSchema,
    sources: ClaimSourcesSchema.optional(),
  }),
  /** What to do next, and where to look when it fails. */
  z.strictObject({
    role: z.literal("close"),
    said: SayableSchema,
    sources: ClaimSourcesSchema.optional(),
  }),
  /**
   * A walkthrough's stop (WALK5, #3337): its narration, the authored lines
   * that add what its screens can't show (C945, C1000), in order, tied to
   * no one screen. Each is said on its own and laid at its place in the
   * stop's take (`laidTake`), and the stop is held for as long as they take;
   * a cards essay plays no walk, so it refuses one (`parseCardsEssay`).
   */
  z.strictObject({
    role: z.literal("walk"),
    lines: z.array(SayableSchema).min(1),
  }),
  /**
   * A spoken card (WALK7, #3282): its category's template plays each
   * exchange, the question in Kokoro and then the owner's own take from
   * home, whole (`spoken-card.ts`). Nothing in it is cut or edited.
   */
  z.strictObject({
    role: z.literal("spoken"),
    category: z.enum(SPOKEN_CATEGORIES),
    exchanges: z
      .array(
        z.strictObject({ ask: SpokenTurnSchema, answer: SpokenTurnSchema })
      )
      .min(1)
      .max(SPOKEN_EXCHANGES_MOST),
  }),
])

export type Spoken = z.infer<typeof SpokenSchema>

export const ShotSchema = z.object({
  id,
  /** The primer's cut this scene says. */
  cut: id.optional(),
  picture: PictureSchema,
  durationMs: ms.min(100),
  /**
   * One cut's take, trimmed to `inMs`..`outMs`, with each word said in it
   * and when, in ms into the file, where the speaker gave them (`/timed`):
   * what the video's captions draw.
   */
  take: z
    .object({
      file: path,
      inMs: ms,
      outMs: ms,
      words: z.array(TimedWordSchema).optional(),
    })
    .optional(),
  /**
   * The speech model that said this scene's take (home's Kokoro, `kokoro`),
   * absent when the owner said it: whose voice the authorship mark reports.
   */
  speaker: z.string().min(1).optional(),
  /** This scene's voice under a Mixed plan: the point said, or the line read. */
  voice: z.enum(["ad-lib", "read"]).optional(),
  /** When the take starts, after the scene does. */
  voiceInMs: ms.default(200),
  /** This scene's own look, over the video's. */
  look: z.enum(LOOKS).optional(),
  /** Single levers set for this scene only, over any plan. */
  overrides: z
    .object({
      transitionIn: z.enum(TRANSITIONS).optional(),
      motion: MotionSchema.optional(),
      cues: z.array(CueSchema).optional(),
      background: BackgroundSchema.optional(),
    })
    .default({}),
  burnIns: z.array(BurnInSchema).default([]),
  idea: IdeaSchema.default({ origin: "agent" }),
  /** What is said over it, in a spoken cards essay (EXPLAIN6). */
  spoken: SpokenSchema.optional(),
})

const author = z.enum(["owner", "claude"])

export const CutListSchema = z.object({
  schema: z.literal(CUT_LIST_SCHEMA),
  title: z.string().min(1),
  /** The series version this video pins (ST11). */
  series: z.object({ id, version: z.number().int().positive() }),
  look: z.enum(LOOKS),
  voice: z.enum(VOICES),
  /** The music bed, if this video sets one over its look's. */
  music: z.enum(MUSIC_MODES).optional(),
  shots: z.array(ShotSchema).min(1),
  /** Burn-ins over the whole video, such as captions. */
  burnIns: z.array(BurnInSchema).default([]),
  /**
   * What every card is stamped with (CARDS4, `stamp.ts`): the commits its
   * cards were checked against, `owner/repo@sha`, and the day.
   */
  stamp: z
    .strictObject({
      sources: z
        .array(z.string().regex(/^[\w.-]+\/[\w.-]+@[0-9a-f]{7,40}$/))
        .min(1)
        .max(3),
      date: z.iso.date(),
    })
    .optional(),
  revisions: z
    .array(
      z.object({
        rev: z.number().int().positive(),
        author,
        message: z.string().min(1),
        at: z.iso.datetime(),
      })
    )
    .default([]),
  /** Notes pinned to a moment: scene `shot`, `offsetMs` into it, at `rev`. */
  notes: z
    .array(
      z.object({
        id,
        rev: z.number().int().positive(),
        shot: id,
        offsetMs: ms,
        author,
        text: z.string().min(1),
        status: z.enum(["open", "applied", "declined", "confirmed"]),
        /** Why it was declined. */
        reason: z.string().min(1).optional(),
        /**
         * On an episode of a show (SHOW SH4): whether the note is about the
         * owner's take, or proposes a change to the show for every episode.
         */
        about: z.enum(["take", "show"]).optional(),
      })
    )
    .default([]),
})

export type CutList = z.infer<typeof CutListSchema>
export type Shot = z.infer<typeof ShotSchema>
export type Picture = Shot["picture"]
export type Capture = Extract<Picture, { kind: "capture" }>
export type Composition = Extract<Picture, { kind: "composition" }>
export type BurnIn = z.infer<typeof BurnInSchema>
export type Idea = z.infer<typeof IdeaSchema>

/** A value, or every reason there isn't one. */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** A problem line per issue zod found, each led by where it is. */
export const problemsOf = (error: z.ZodError, what: string): Array<string> =>
  error.issues.map((i) => `${i.path.join(".") || what}: ${i.message}`)

/** Each line once, in the order first said. */
export const once = (lines: ReadonlyArray<string>): Array<string> => [
  ...new Set(lines),
]

/** The cut list, or every reason it can't be rendered as written. */
export function parseCutList(raw: unknown): Parsed<CutList> {
  const parsed = CutListSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, problems: problemsOf(parsed.error, "cut list") }
  }
  const problems = once([
    ...shotProblems(parsed.data.shots),
    ...authorshipProblems(parsed.data),
    ...badgeProblems(parsed.data),
    ...stampProblems(parsed.data),
    ...wholeVideoProblems(
      parsed.data,
      isCaptions,
      "the captions burn-in",
      "each take's words"
    ),
  ])
  return problems.length
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

function shotProblems(shots: ReadonlyArray<Shot>): Array<string> {
  const problems: Array<string> = []
  const seen = new Set<string>()
  shots.forEach((s, i) => {
    const say = (what: string): void => {
      problems.push(`${s.id}: ${what}`)
    }
    if (seen.has(s.id)) say("two scenes share this id")
    seen.add(s.id)
    const p = s.picture
    const o = s.overrides
    if (p.kind === "capture" && p.outMs !== undefined && p.outMs <= p.inMs) {
      say("the capture ends before it starts")
    }
    if (s.take && s.take.outMs <= s.take.inMs) {
      say("the take ends before it starts")
    }
    if (s.take && s.voiceInMs + s.take.outMs - s.take.inMs > s.durationMs) {
      say("the take runs past the scene's end")
    }
    if (i === 0 && o.transitionIn && o.transitionIn !== "cut") {
      say("the first scene has nothing to come in from")
    }
    if (p.kind === "card" && o.motion && o.motion.kind !== "still") {
      say("a card has no picture to move")
    }
    const into = o.transitionIn ?? "cut"
    if (drawsItself(s)) {
      if (o.motion || o.background) say("a composition draws its own picture")
      if (into !== "cut") say("a composition draws its own way in")
    } else if (drawsItself(shots[i - 1]) && into !== "cut") {
      say("the composition before it draws its own way out")
    }
    const m = o.motion
    const times =
      m?.kind === "punch-in"
        ? m.at
        : m?.kind === "freeze"
          ? [m.atMs]
          : m?.kind === "pan"
            ? m.keys.map(([t]) => t)
            : []
    if (times.some((t) => t > s.durationMs)) {
      say("a motion time is past the scene's end")
    }
    if (p.kind === "capture" && p.taps.some((t) => t >= s.durationMs)) {
      say("a tap is past the scene's end")
    }
    if (o.cues?.some((c) => c.atMs > s.durationMs)) {
      say("a sound cue is past the scene's end")
    }
  })
  return problems
}

/** The authorship mark's kind among the burn-ins (`authorship.ts`). */
const AUTHORSHIP = "authorship"

/** Whether a burn-in is the authorship mark. */
export const isAuthorship = (b: BurnIn): boolean => b.kind === AUTHORSHIP

/** The captions' kind among the burn-ins (`@some-ui/burn-ins`). */
const CAPTIONS = "captions"

/** Whether a burn-in is the captions. */
export const isCaptions = (b: BurnIn): boolean => b.kind === CAPTIONS

/** The host's kind among the burn-ins (`@some-ui/burn-ins`' `host`). */
const HOST = "host"

/**
 * Whether a burn-in floats over every other one: the host, a layer of its
 * own over the card wherever it sits (C1485).
 */
export const isOverlay = (b: Pick<BurnIn, "kind">): boolean => b.kind === HOST

/**
 * Whether a scene draws its own picture and way in and out: a composition,
 * or a screen of the app, which is drawn as one once home hands it
 * (`resolveScreens`), so the essay is refused for it before anything is said.
 */
const drawsItself = (s: Shot | undefined): boolean =>
  s?.picture.kind === "composition" || s?.picture.kind === "screen"

/** Whether a scene's picture is a composition, which draws its own (HYPER2). */
export const isComposition = (s: Shot | undefined): boolean =>
  s?.picture.kind === "composition"

/**
 * What a burn-in the renderer draws over the whole video, from the scenes
 * alone, may not be: on one scene, asked for twice, or written for. The
 * authorship mark and the captions (SFEED11) are such burn-ins.
 */
function wholeVideoProblems(
  cut: CutList,
  is: (b: BurnIn) => boolean,
  name: string,
  from: string
): Array<string> {
  const problems = cut.shots
    .filter((s) => s.burnIns.some(is))
    .map((s) => `${s.id}: ${name} covers the whole video`)
  const asked = cut.burnIns.filter(is)
  if (asked.length > 1) problems.push(`${name} is drawn once`)
  if (asked.some((b) => Object.keys(b.params).length > 0)) {
    problems.push(`${name} is drawn from ${from}; nothing is written for it`)
  }
  return problems
}

/**
 * Where the authorship mark can go: over the whole video, with nothing
 * written for it (the renderer draws it from the scenes alone), and a bare
 * card first and last for its intro and its end card.
 */
function authorshipProblems(cut: CutList): Array<string> {
  const problems = wholeVideoProblems(
    cut,
    isAuthorship,
    "the authorship mark",
    "the scenes"
  )
  const authorOf = new Map(cut.notes.map((n) => [n.id, n.author]))
  for (const s of cut.shots) {
    const idea = s.idea
    // Only a note is checked here: the cut list carries its notes, but an
    // `idea` cites an answer kept on the phone, outside it, so the phone
    // checks that one where it starts the scene (soundbites'
    // `lib/idea/reply.ts`).
    const cited =
      idea.origin === "you" && idea.from.kind === "note"
        ? idea.from.id
        : undefined
    const author = cited === undefined ? undefined : authorOf.get(cited)
    if (cited !== undefined && author === undefined) {
      problems.push(
        `${s.id}: its idea cites note ${cited}, which the project doesn't have`
      )
    } else if (cited !== undefined && author !== "owner") {
      problems.push(
        `${s.id}: its idea cites note ${cited}, which isn't in the owner's words`
      )
    }
  }
  if (!cut.burnIns.some(isAuthorship)) return problems
  const bare = (s: Shot | undefined): boolean =>
    s?.picture.kind === "card" && s.burnIns.length === 0
  if (cut.shots.length < 3) {
    problems.push(
      "the authorship mark needs a scene between its intro and its end card"
    )
  } else {
    if (!bare(cut.shots[0])) {
      problems.push(
        "the authorship mark's intro needs a bare card as the first scene"
      )
    }
    if (!bare(cut.shots.at(-1))) {
      problems.push(
        "the authorship mark's end card needs a bare card as the last scene"
      )
    }
  }
  return problems
}

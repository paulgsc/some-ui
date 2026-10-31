/**
 * Every state the Studio sweep walks (`../studio-fit.spec.ts`), by id: the
 * phone's Studio (`@some-ui/soundbites`) on fakes, opened on a video in
 * each standing the sweep needs, and New idea beside it. The spec taps from
 * each fixture's Start to the screens that standing reaches.
 *
 * Each mounts `Studio` as `/journal` does (src/routes/_dashboard/_apk/
 * journal/index.tsx): the wing's heading and the New idea card above it, in
 * the route's own column. The card is a plain link here, since the page has
 * no router; its classes are the route's, which www's CSS carries. A change
 * to the route's shell is a change to `JournalHome` below.
 *
 * `planted-overflow` is not a screen. It is the sweep's self-test: a box of a
 * fixed height around content that cannot fit, so a harness that silently
 * measures nothing goes red.
 */

import type { JSX, ReactNode } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  IdeaListener,
  Project,
  ProjectEvent,
  ProjectState,
  StudioProps,
} from "@some-ui/soundbites"
import {
  IdeaCapture,
  keptTimeLog,
  newProject,
  step,
  Studio,
  STUDIO_WORDS,
} from "@some-ui/soundbites"
import type { Primer } from "@some-ui/soundbites/fixtures"
import {
  cutListOf,
  fakeMic,
  memoryProjectStore,
  readPrimer,
} from "@some-ui/soundbites/fixtures"
import { REVIEW_SCHEMA } from "@some-ui/video-render"
import { Lightbulb } from "lucide-react"

import { FIT_CUTS, FIT_PRIMER_TEXT, FIT_REVIEW_SCHEMA } from "./studio-seed"

const WORDS = STUDIO_WORDS

// Widened: both are literals, and as such the check would read as settled.
const renderedSchema: string = REVIEW_SCHEMA
if (renderedSchema !== FIT_REVIEW_SCHEMA) {
  throw new Error(
    `studio-seed.ts writes reviews as ${FIT_REVIEW_SCHEMA}; the renderer reads ${renderedSchema}`
  )
}

const AT = "2026-10-30T09:00:00.000Z"

const PRIMER: Primer = ((): Primer => {
  const reading = readPrimer(FIT_PRIMER_TEXT)
  if (!reading.ok) {
    throw new Error(`the fit primer no longer reads: ${reading.problem}`)
  }
  return reading.primer
})()

/** `events` in order from `state`, each one accepted. */
function run(
  state: ProjectState,
  ...events: ReadonlyArray<ProjectEvent>
): ProjectState {
  return events.reduce((at, event) => {
    const next = step(at, event)
    if (next.refused !== null) {
      throw new Error(`the fit video refuses ${event.type}: ${next.refused}`)
    }
    return next.state
  }, state)
}

/** The video as Studio opens a primer: revision 1, Claude's, nothing taken. */
function opened(id: string): ProjectState {
  return newProject(id, {
    author: "claude",
    message: `Primer: ${PRIMER.title}`,
    at: AT,
    cutList: cutListOf(PRIMER),
    primer: PRIMER,
  })
}

/** A take of four seconds on scene `shot`, still on the phone. */
const taken = (shot: string): ReadonlyArray<ProjectEvent> => [
  { type: "takeStarted", shot },
  {
    type: "taken",
    take: {
      id: `take-${shot}`,
      shot,
      recordedAt: AT,
      durationMs: 4_000,
      mimeType: "audio/webm",
    },
  },
]

/** Nothing recorded yet: Record opens on scene 1 before any take. */
const FRESH: Project = opened("fit-fresh").project

/**
 * Every scene taken, a note of the owner's that Claude applied in revision
 * 2, and the owner's mark that it is ready: Watch asks about the change at
 * the first moment of a render of revision 2, Finish is ready for YouTube,
 * and Record shows a scene with its take.
 */
const REVIEWED: Project = ((): Project => {
  const first = opened("fit-reviewed")
  const [path] = FIT_CUTS
  const withTakes = run(first, ...FIT_CUTS.flatMap((cut) => taken(cut.id)))
  return run(
    withTakes,
    {
      type: "noted",
      note: {
        id: "note-path",
        rev: 1,
        shot: path.id,
        offsetMs: 0,
        author: "owner",
        text: "Hold the path card a beat longer, so all three picks can be read before the cut.",
      },
    },
    { type: "noteSettled", id: "note-path", status: "applied" },
    {
      type: "revised",
      author: "claude",
      message: "Held the path card a beat longer, as the note asked.",
      at: AT,
      cutList: cutListOf(PRIMER, {
        cutList: withTakes.project.revisions[0].cutList,
        project: withTakes.project,
      }),
    },
    { type: "markedReady", rev: 2, at: AT }
  ).project
})()

const noop = (): void => undefined

/** A recognizer that is there and never finishes, so each screen offers to listen. */
const listener: IdeaListener = {
  available: () => Promise.resolve(true),
  listen: () => ({
    done: new Promise(() => undefined),
    stop: noop,
    cancel: noop,
  }),
}

/** Studio on `projects`, in memory: a microphone that always hears, and a time log of this page load. */
function studioPorts(
  projects: ReadonlyArray<Project>
): NonNullable<StudioProps["ports"]> {
  return {
    store: memoryProjectStore(projects).store,
    startRecording: fakeMic(),
    timeLog: keptTimeLog(inMemoryStorage),
    listener,
  }
}

/** The Studio wing's Home, as the route lays it out around `children`. */
const JournalHome = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-2xl font-bold tracking-tight">{WORDS.heading}</h1>
    <a
      href="#idea"
      className="bg-card border-brand focus-visible:ring-ring flex items-center gap-3 rounded-2xl border-2 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
    >
      <Lightbulb aria-hidden className="text-brand size-6 shrink-0" />
      <span className="min-w-0">
        <span className="block text-base font-extrabold">
          {WORDS.idea.newIdea}
        </span>
        <span className="text-muted-foreground block text-sm">
          {WORDS.idea.newIdeaLine}
        </span>
      </span>
    </a>
    {children}
  </div>
)

function studioOn(projects: ReadonlyArray<Project>): () => JSX.Element {
  const StudioFixture = (): JSX.Element => (
    <JournalHome>
      <Studio ports={studioPorts(projects)} />
    </JournalHome>
  )
  return StudioFixture
}

export const PHONE_FIXTURES = {
  /** Start with no video: the primer pick alone. */
  "studio-empty": studioOn([]),
  "studio-fresh": studioOn([FRESH]),
  "studio-reviewed": studioOn([REVIEWED]),

  /** New idea (`/journal/idea`), as its route lays it out. */
  idea: (): JSX.Element => (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
        {WORDS.idea.heading}
      </h1>
      <IdeaCapture
        ports={{ listener }}
        back={
          <a
            href="#studio"
            className="text-muted-foreground text-sm underline underline-offset-4"
          >
            {WORDS.idea.back}
          </a>
        }
      />
    </div>
  ),

  // A box that asserts a height its content cannot fit, which the body's
  // scroll does not excuse: the leak the sweep must see.
  "planted-overflow": (): JSX.Element => (
    <div className="planted-panel" style={{ height: 120 }}>
      <div style={{ height: 900 }}>too tall</div>
    </div>
  ),
} satisfies Record<string, () => JSX.Element>

export type PhoneId = keyof typeof PHONE_FIXTURES

export function isPhoneId(id: string | null): id is PhoneId {
  return id !== null && Object.hasOwn(PHONE_FIXTURES, id)
}

export const PHONE_IDS: ReadonlyArray<PhoneId> =
  Object.keys(PHONE_FIXTURES).filter(isPhoneId)

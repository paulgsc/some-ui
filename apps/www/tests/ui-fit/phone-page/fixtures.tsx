/**
 * Every state the Studio sweep walks (`../studio-fit.spec.ts`), by id: the
 * phone's Studio (`@some-ui/soundbites`) on fakes, opened on a video in
 * each standing the sweep needs, and New idea beside it. The spec taps from
 * each fixture's Start to the screens that standing reaches.
 *
 * Each mounts the page its route mounts (`StudioHome`, `NewIdeaPage`), with
 * plain anchors for the route's links, since the page has no router.
 *
 * `planted-overflow` and `planted-wide` are not screens. They are the sweep's
 * self-tests: a box of a fixed height around content that cannot fit, and a
 * row wider than the phone, so a harness that silently measures nothing, or
 * lets the body's scroll hide a screen that leaves the phone sideways, goes
 * red.
 */

import type { JSX } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  IdeaListener,
  Project,
  ProjectEvent,
  StudioProps,
  WingLink,
} from "@some-ui/soundbites"
import {
  keptDraftStore,
  keptIdeaStore,
  keptLetGo,
  keptTimeLog,
  NewIdeaPage,
  StudioHome,
} from "@some-ui/soundbites"
import {
  bundleTakesOf,
  cutListOf,
  memoryProjectStore,
  primerOf,
  projectFromPrimer,
  run,
} from "@some-ui/soundbites/fixtures"
import { ONE_TAKE } from "@some-ui/voice-capture"
import {
  simulatedMicrophone,
  simulatedPattern,
  SPEAKING,
} from "@some-ui/voice-capture/testing"

import { FIT_CUTS, FIT_PRIMER_TEXT } from "./studio-seed"

const AT = "2026-10-30T09:00:00.000Z"

const PRIMER = primerOf(FIT_PRIMER_TEXT)

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
const FRESH: Project = projectFromPrimer("fit-fresh", PRIMER, AT).project

/**
 * Every scene taken, and no one's word yet on whose idea each is: Finish
 * waits on that, and opens Watch at the first scene asked.
 */
const TAKEN: Project = run(
  projectFromPrimer("fit-taken", PRIMER, AT),
  ...FIT_CUTS.flatMap((cut) => taken(cut.id))
).project

/**
 * Every scene taken, a note of the owner's that Claude applied in revision
 * 2, and the owner's mark that it is ready, from before Finish waited on
 * whose idea each scene is (#2253): Watch asks about the change at the
 * first moment of a render of revision 2, then whose idea the scene is,
 * Finish is still ready for YouTube, and Record shows a scene with its take.
 */
const REVIEWED: Project = ((): Project => {
  const first = projectFromPrimer("fit-reviewed", PRIMER, AT)
  const [path] = FIT_CUTS
  const withTakes = run(first, ...FIT_CUTS.flatMap((cut) => taken(cut.id)))
  const reviewed = run(
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
    }
  ).project
  return { ...reviewed, ready: [{ rev: 2, at: AT }] }
})()

/**
 * Every scene taken and home holding each take, still on the phone: Start
 * asks when takes leave the phone, and under "keep until Drive has it"
 * lists each with its "Drive has it" (HF11).
 */
const HELD: Project = ((): Project => {
  const all = run(
    projectFromPrimer("fit-held", PRIMER, AT),
    ...FIT_CUTS.flatMap((cut) => taken(cut.id))
  ).project
  return {
    ...all,
    takes: all.takes.map((take) => ({ ...take, keptBy: ["home"] })),
  }
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
    // The shared simulated microphone: opens at once, hears four seconds.
    startRecording: simulatedMicrophone({
      now: Date.now,
      fallback: { ...SPEAKING, durationMs: 4_000 },
    }).startRecording,
    timeLog: keptTimeLog(inMemoryStorage),
    // Kept as long as the page is: a choice made on Start stays made.
    letGo: keptLetGo(once(inMemoryStorage())),
    listener,
  }
}

/**
 * New idea on the shared simulated microphone and the take pattern with
 * `send: "on-confirm"`, its draft and ideas in this page load's memory;
 * `refuse`: the microphone refuses the first take, so voice doesn't come
 * through.
 */
function newIdea(refuse: boolean): () => JSX.Element {
  const simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  if (refuse) {
    simulated.mic.script({
      ...SPEAKING,
      open: { kind: "refuse", reason: "denied", ms: 0 },
    })
  }
  const storage = once(inMemoryStorage())
  const takes = bundleTakesOf(simulated)
  const ports = {
    drafts: keptDraftStore(storage),
    ideas: keptIdeaStore(storage),
  }
  const IdeaFixture = (): JSX.Element => (
    <NewIdeaPage takes={takes} ports={ports} backLink={STUDIO_LINK} />
  )
  return IdeaFixture
}

/** `storage`, the same one on every look. */
function once(storage: Storage): () => Storage {
  return () => storage
}

/** A link to `href`, as an anchor: the page has no router. */
function anchorTo(href: string): WingLink {
  const Anchor: WingLink = ({ className, children }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
  return Anchor
}

const IDEA_LINK = anchorTo("#idea")
const IDEAS_LINK = anchorTo("#ideas")
const STUDIO_LINK = anchorTo("#studio")

/** The Studio wing's Home on `projects`. */
function studioOn(projects: ReadonlyArray<Project>): () => JSX.Element {
  const StudioFixture = (): JSX.Element => (
    <StudioHome
      ports={studioPorts(projects)}
      ideaLink={IDEA_LINK}
      ideasLink={IDEAS_LINK}
    />
  )
  return StudioFixture
}

export const PHONE_FIXTURES = {
  /** Start with no video: the primer pick alone. */
  "studio-empty": studioOn([]),
  "studio-fresh": studioOn([FRESH]),
  "studio-taken": studioOn([TAKEN]),
  "studio-reviewed": studioOn([REVIEWED]),
  "studio-held": studioOn([HELD]),

  /** New idea (`/journal/idea`). */
  idea: newIdea(false),
  /** New idea, where the microphone refuses the first take. */
  "idea-voice-lost": newIdea(true),

  // A box that asserts a height its content cannot fit, which the body's
  // scroll does not excuse: the leak the sweep must see.
  "planted-overflow": (): JSX.Element => (
    <div className="planted-panel" style={{ height: 120 }}>
      <div style={{ height: 900 }}>too tall</div>
    </div>
  ),

  // A row wider than any phone that sizes to its own content, so it holds
  // what it has and leaks nothing: only the body, scrolling sideways to show
  // it, says the screen is wider than the phone.
  "planted-wide": (): JSX.Element => (
    <div className="planted-wide" style={{ width: 900 }}>
      too wide
    </div>
  ),
} satisfies Record<string, () => JSX.Element>

export type PhoneId = keyof typeof PHONE_FIXTURES

export function isPhoneId(id: string | null): id is PhoneId {
  return id !== null && Object.hasOwn(PHONE_FIXTURES, id)
}

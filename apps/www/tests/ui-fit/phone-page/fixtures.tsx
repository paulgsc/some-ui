/**
 * Every state the Studio sweep walks (`../studio-fit.spec.ts`), and the
 * drag-down indicator's (`./pull`, `../pull-fit.spec.ts`), by id: the
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
  STUDIO_WORDS,
  StudioHome,
} from "@some-ui/soundbites"
import {
  bundleTakesOf,
  cutListOf,
  episodeProjectOf,
  memoryProjectStore,
  primerOf,
  projectFromPrimer,
  run,
} from "@some-ui/soundbites/fixtures"
import type { Format } from "@some-ui/video-render"
import { episodeOf, FORMAT_SCHEMA } from "@some-ui/video-render"
import type { TurnListener } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { MicScript } from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  simulatedPattern,
  SPEAKING,
} from "@some-ui/voice-capture/testing"

import { APH_FIXTURES } from "./aph"
import { MY_DATA_FIXTURES } from "./my-data"
import { PULL_FIXTURES } from "./pull"
import { ROUNDS_FIXTURES } from "./rounds"
import { SettingsBar } from "./settings-bar"
import { SOUNDBITES_FIXTURES } from "./soundbites"
import { FIT_CUTS, FIT_PRIMER_TEXT } from "./studio-seed"
import { TOPIK_FIXTURES } from "./topik"
import { WWW_FIXTURES } from "./www"

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

/**
 * A show's format whose names and points run as long as Playoff Delta's,
 * so its episodes fill Start and the show's screen (SHOW SH3).
 */
const FIT_FORMAT: Format = {
  schema: FORMAT_SCHEMA,
  id: "fit-week",
  version: 1,
  title: "A week of the fit show",
  series: { id: "fit-week", version: 1 },
  look: "calm",
  scenes: FIT_CUTS.map((cut) => ({
    id: cut.id,
    name: cut.artifact,
    point: cut.point,
    picture: { kind: "capture", from: "the stage's slide", cssWidth: 1080 },
    holdMs: cut.targetSec * 1_000,
  })),
}

/**
 * The episode of week `week`, opened at `at`, nothing recorded yet; with
 * `proposed`, a change to the show the owner noted on its first scene (SH4).
 */
function episodeFor(week: number, at: string, proposed?: string): Project {
  const made = episodeOf(FIT_FORMAT, {
    show: "Playoff Delta, followed from the 49ers' side of the bracket",
    title: `Playoff Delta, 2026 week ${week}`,
    period: `2026 week ${week}, every game played`,
    data: { source: `fit/2026/week-${week}.json`, sha256: "a".repeat(64) },
    // As long as the show's copy runs (SH5), so Finish is measured at it.
    upload: {
      title: `Playoff Delta · 2026 week ${week} · Keep driving`,
      description: [
        `2026 week ${week}, read from the Niners' side. We lost to the Falcons.`,
        "The week: 0 steps our way, 1 step against us. The division: in our hands. The #1 seed: in our hands. As good as the #1 seed, as bad as out. Keep driving.",
        "Over every way the rest of the season can go. Standings only: a tie goes to us.",
      ].join("\n\n"),
    },
    keep: FIT_CUTS.map((cut) => ("keep" in cut ? [...cut.keep] : [])),
    inMs: (index) => 1_200 + index,
  })
  if (!made.ok) throw new Error(made.problems.join("; "))
  const opened = episodeProjectOf(
    `fit-episode-${week}`,
    JSON.stringify(made.value),
    at
  )
  if (proposed === undefined) return opened.project
  return run(opened, {
    type: "noted",
    note: {
      id: "fit-proposed",
      rev: 1,
      shot: FIT_CUTS[0].id,
      offsetMs: 4_000,
      author: "owner",
      text: proposed,
      about: "show",
    },
  }).project
}

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
const listener: TurnListener = {
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
  // Each take hears four seconds, however soon the walk taps to stop it.
  const speaking: MicScript = { ...SPEAKING, durationMs: 4_000 }
  const refused: MicScript = {
    ...SPEAKING,
    open: { kind: "refuse", reason: "denied", ms: 0 },
  }
  simulated.mic.script(
    ...(refuse ? [refused] : []),
    speaking,
    speaking,
    speaking
  )
  const storage = once(inMemoryStorage())
  const takes = bundleTakesOf(simulated)
  const ports = {
    drafts: keptDraftStore(storage),
    ideas: keptIdeaStore(storage),
  }
  const IdeaFixture = (): JSX.Element => (
    <NewIdeaPage
      takes={takes}
      ports={ports}
      backLink={STUDIO_LINK}
      // The route's way to pairing (`PairHomeLink`), as an anchor here.
      pair={
        <a
          href="#pair"
          className="text-brand self-start text-sm font-semibold underline underline-offset-4"
        >
          {STUDIO_WORDS.pair.pair}
        </a>
      }
    />
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

/**
 * Week 8's episode with every scene taken and marked ready: Finish shows
 * the show's upload copy (SH5).
 */
function readyEpisode(): Project {
  const project = episodeFor(8, "2026-11-03T09:00:00.000Z")
  const at = "2026-11-03T10:00:00.000Z"
  const shots = project.revisions[0]?.cutList.shots ?? []
  return {
    ...project,
    takes: shots.map((each) => ({
      id: `fit-take-${each.id}`,
      shot: each.id,
      recordedAt: at,
      durationMs: 4_000,
      mimeType: "audio/webm",
      keptBy: [],
      onPhone: true,
    })),
    chosen: Object.fromEntries(
      shots.map((each) => [each.id, `fit-take-${each.id}`])
    ),
    ready: [{ rev: 1, at }],
  }
}

/** Studio's fixtures, which `../studio-fit.spec.ts` walks, every one. */
const STUDIO_FIXTURES = {
  /** Start with no video: the primer pick alone. */
  "studio-empty": studioOn([]),
  "studio-fresh": studioOn([FRESH]),
  "studio-taken": studioOn([TAKEN]),
  "studio-reviewed": studioOn([REVIEWED]),
  "studio-held": studioOn([HELD]),
  /** Two episodes of a show and a video of your own, Start on the newest episode. */
  "studio-episode": studioOn([
    FRESH,
    episodeFor(
      7,
      "2026-10-29T09:00:00.000Z",
      "Hold the division slide a beat longer every week, so the floor and the ceiling both land before the next scene."
    ),
    episodeFor(8, "2026-11-03T09:00:00.000Z"),
  ]),
  /** An episode ready for YouTube, its upload copy from the show (SH5). */
  "studio-episode-ready": studioOn([readyEpisode()]),

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

export type StudioId = keyof typeof STUDIO_FIXTURES

export const PHONE_FIXTURES = {
  ...STUDIO_FIXTURES,
  /** The drag-down indicator, each phase (`./pull`, `../pull-fit.spec.ts`). */
  ...PULL_FIXTURES,
  /** Settings' bar of pages, for `../settings-bar-fit.spec.ts`. */
  "settings-bar": SettingsBar,
  /** My data, its overview and a kind's list (`../my-data-fit.spec.ts`). */
  ...MY_DATA_FIXTURES,
  /** aph's logger and History (`./aph`, `../stays-put.spec.ts`). */
  ...APH_FIXTURES,
  /** The rounds wing's screens (`./rounds`, `../stays-put-rounds.spec.ts`). */
  ...ROUNDS_FIXTURES,
  /** The handheld lesson (`./topik`, `../stays-put-topik.spec.ts`). */
  ...TOPIK_FIXTURES,
  /** www's screens and shared parts (`./www`, `../stays-put-www.spec.ts`). */
  ...WWW_FIXTURES,
  /** Studio's wing, for `../stays-put-soundbites.spec.ts` (`./soundbites`). */
  ...SOUNDBITES_FIXTURES,
} satisfies Record<string, () => JSX.Element>

export type PhoneId = keyof typeof PHONE_FIXTURES

export function isPhoneId(id: string | null): id is PhoneId {
  return id !== null && Object.hasOwn(PHONE_FIXTURES, id)
}

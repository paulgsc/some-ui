/**
 * The interview week's one runtime, shared by its pages (IW8,
 * paulgsc/some-ui#3175): the layout route makes it once per mount
 * (`InterviewWeek`), and every page under it reads the same snapshots and
 * dispatches through it (`useInterview`), so a take, its cue and the send
 * outlive a step from one page to the next (docs/monorepo-boundaries.md,
 * "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import type { InterviewWeek } from "@some-ui/interview-week"
import { isOpening } from "@some-ui/interview-week"
import { bundleConfirm, ConfirmSheet, useTakePattern } from "@some-ui/shared"
import type {
  BundleTakes,
  PatternTake,
  TakeItemView,
  TakePatternSnapshot,
  TakeRowView,
} from "@some-ui/voice-capture"
import { currentTakeOf, takeItemView } from "@some-ui/voice-capture"

import type { Cue } from "@/lib/interview-week/cue"
import type { Ladder } from "@/lib/interview-week/ladder"
import type {
  InterviewWeekPorts,
  InterviewWeekRun,
} from "@/lib/interview-week/runtime"
import { createInterviewWeek } from "@/lib/interview-week/runtime"
import type { InterviewAtHome, InterviewState } from "@/lib/interview-week/spec"
import { cardOf, takeLine } from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

/** What every page of the week reads. */
export type Interview = {
  readonly run: InterviewWeekRun
  readonly week: InterviewWeek
  readonly takes: BundleTakes
  readonly state: InterviewState
  readonly snapshot: TakePatternSnapshot
  readonly atHome: InterviewAtHome
  readonly cue: Cue
  readonly ladder: Ladder
}

const InterviewContext = createContext<Interview | null>(null)

/** The week's runtime, as the layout route holds it. */
export function useInterview(): Interview {
  const held = useContext(InterviewContext)
  if (held === null) throw new Error("an interview page outside its week")
  return held
}

/** `item`'s takes as the take parts draw them. */
export const viewOf = (
  { run, state, snapshot, takes }: Interview,
  item: string
): TakeItemView =>
  takeItemView(
    snapshot,
    state.takes,
    run.machine.answersOf(state, item),
    takes.pattern.options
  )

/** `item`'s take on screen now, if it has one. */
export const currentOf = (
  { state }: Pick<Interview, "state">,
  item: string
): PatternTake | null =>
  currentTakeOf(state.takes, takeLine(state.draft.id, item))

/** A take's row, to play and nothing more. */
export const playOnly = (row: TakeRowView): TakeRowView => ({
  ...row,
  canRedo: false,
  canLetGo: false,
})

/** A card's name in the look over: "Question 2", "Read 1". */
export function labelOf(week: InterviewWeek, item: string): string {
  const card = cardOf(item)
  if (card === null)
    return WORDS.questionLabel(
      week.questions.findIndex(({ id }) => id === item) + 1
    )
  // The essay's opening is no read (IW10): the reads count without it.
  const reads = week.cards.filter((read) => !isOpening(read))
  const n = reads.findIndex(({ id }) => id === card)
  return n < 0 ? WORDS.opening : WORDS.readLabel(n + 1)
}

export type InterviewWeekProps = {
  /** The phone's ports. Read once, on mount. */
  ports: InterviewWeekPorts
  children: ReactNode
}

/** Holds the week's runtime for as long as its pages are on screen. */
export const InterviewWeekRuntime = ({
  ports,
  children,
}: InterviewWeekProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and the week and takes it runs on, are made once per mount, as Rust Rounds' week's are */
  const [{ run, takes, week }] = useState(() => ({
    run: createInterviewWeek(ports),
    takes: ports.takes,
    week: ports.week.week,
  }))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => run.attach(), [run])
  const state = useSyncExternalStore(
    run.bundle.subscribe,
    run.bundle.getSnapshot
  )
  const atHome = useSyncExternalStore(
    run.atHome.subscribe,
    run.atHome.getSnapshot
  )
  const cue = useSyncExternalStore(run.cue.subscribe, run.cue.getSnapshot)
  const ladder = useSyncExternalStore(
    run.ladder.subscribe,
    run.ladder.getSnapshot
  )
  const snapshot = useTakePattern(takes.pattern)
  const { dispatch } = run
  return (
    <InterviewContext.Provider
      value={{ run, week, takes, state, snapshot, atHome, cue, ladder }}
    >
      {children}
      <ConfirmSheet
        request={bundleConfirm(
          { machine: run.machine, state, dispatch, words: WORDS },
          (item) => labelOf(week, item)
        )}
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </InterviewContext.Provider>
  )
}

/** While this phone holds no week from home. */
export const NoInterviewWeek = (): JSX.Element => (
  <section className="bg-card flex flex-col gap-2 rounded-2xl p-4">
    <h2 className="text-xl font-bold">{WORDS.none.title}</h2>
    <p className="text-muted-foreground text-sm">{WORDS.none.line}</p>
  </section>
)

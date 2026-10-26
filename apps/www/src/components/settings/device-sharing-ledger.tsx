/**
 * Settings' ledger of what this phone shares with its paired home (LA9 to
 * LA11, LA13, docs/learner-data-authority.md): one row per record, each kind it
 * holds with since when and how much is on home, the way to stop, what is
 * never shared, and every choice ever made. Its words are
 * `lib/home-link/words`'s alone; it sends nothing.
 *
 * aph's record comes back to the phone as it stops, which only aph's own
 * screens can do (`@some-ui/aph` is theirs), so its row says where to stop
 * instead of offering it here.
 *
 * The status page's rows for the same records come from here too
 * (`useLaneRows`), read without a watch of their own: LA8 lets only the
 * modules on its allowlist read the lanes, and this is one.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button, Label, Switch } from "@some-ui/shared"

import { useHomeLink } from "@/lib/home-link"
import type { Scope } from "@/lib/home-link/consent-model"
import { everChosen } from "@/lib/home-link/consent-model"
import { phoneConsent } from "@/lib/home-link/consent-runtime"
import { jobsLane } from "@/lib/home-link/jobs"
import type { KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { Lane, LaneCounts, LaneId } from "@/lib/home-link/lanes"
import {
  pairingOf,
  stopOnHome,
  useLaneChoices,
  useLaneRun,
} from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import { useUnsendable, voiceLane } from "@/lib/home-link/voice"
import {
  fullDay,
  historyLines,
  laneView,
  LEDGER,
  lookedAt,
  SHEET,
  unsentLines,
  WORDS,
} from "@/lib/home-link/words"
import { phoneJobs } from "@/lib/jobs"
import { NOTICE_WORDS, noticeSaid } from "@/lib/jobs/words"
import type { BoardPage, BoardRow } from "@/lib/status-board"
import { BOARD_WORDS } from "@/lib/status-board/words"
import { useJobs } from "@/components/jobs/parts"

const APH_SCOPES = { scopes: ["aph"] } as const

const NO_COUNTS: LaneCounts = {
  held: {},
  refused: {},
  waiting: 0,
  away: null,
  hidden: 0,
  pulled: true,
  offered: 0,
}

const Row = ({
  id,
  counts,
  lane,
  unsure,
  children,
}: {
  id: LaneId
  counts: LaneCounts
  /** The lane to stop here, or `null` where it stops elsewhere (aph). */
  lane: Lane | null
  /**
   * Its choice may have been made before this phone kept its choices
   * (`lanes.ts`'s `enterEarlier`), which only its own screens enter.
   */
  unsure: boolean
  /** What the row offers while its record is kept on home. */
  children?: ReactNode
}): JSX.Element => {
  const { shared, stopped } = useLaneChoices(lane ?? APH_SCOPES)
  const [confirming, setConfirming] = useState(false)
  const [refused, setRefused] = useState(false)
  const question = useRef<HTMLParagraphElement>(null)
  const stop = useRef<HTMLButtonElement>(null)
  const asked = useRef(false)
  useEffect(() => {
    // The pressed button is gone: the question takes its focus, and gives
    // it back to Stop when the question closes with sending kept.
    if (confirming) question.current?.focus()
    else if (asked.current) stop.current?.focus()
    asked.current = confirming
  }, [confirming])
  const words = WORDS[id]
  const view = laneView(
    words,
    { ...counts, known: true, shared, stopped, run: INITIAL_KEPT, away: null },
    fullDay
  )
  const kept = shared.size > 0
  return (
    <li className="space-y-2 py-3">
      <p className="text-sm font-medium">{LEDGER.names[id]}</p>
      {unsure ? (
        <p className="text-muted-foreground text-xs">
          {LEDGER.unsure(LEDGER.opens[id])}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {view.rows.map((row) => (
            <li key={row.label} className="text-muted-foreground text-xs">
              {row.label}: {row.text}
            </li>
          ))}
        </ul>
      )}
      {kept ? children : null}
      {refused ? (
        <p className="text-destructive text-xs" role="status">
          {SHEET.stopRefused}
        </p>
      ) : null}
      {!kept ? null : lane === null ? (
        <p className="text-muted-foreground text-xs">{LEDGER.stopInAph}</p>
      ) : confirming ? (
        <div className="space-y-2 rounded-md border p-3">
          <p ref={question} tabIndex={-1} className="text-sm">
            {words.stopQuestion}
          </p>
          <p className="text-muted-foreground text-xs">{words.stopMore}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false)
                setRefused(!stopOnHome(lane))
              }}
            >
              {SHEET.stopYes}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              {SHEET.stopNo}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={stop}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRefused(false)
            setConfirming(true)
          }}
        >
          {SHEET.stop}
        </Button>
      )}
    </li>
  )
}

const PracticeRow = (): JSX.Element => (
  <Row
    id="practice"
    counts={practiceLane.useCounts()}
    lane={practiceLane}
    unsure={false}
  />
)

/**
 * Whether home tells this phone when the morning run is in (RUN5), where
 * this build can be told; nothing where it can't.
 */
const JobsNotice = (): JSX.Element | null => {
  const { state, notice } = useJobs()
  if (!notice.offered) return null
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Switch
        id="jobs-notice"
        checked={state.home.notice.wanted}
        disabled={notice.asking}
        onCheckedChange={(on) => phoneJobs().wantNotice(on)}
      />
      <div className="space-y-1">
        <Label htmlFor="jobs-notice" className="text-sm">
          {NOTICE_WORDS.label}
        </Label>
        <p className="text-muted-foreground text-xs" role="status">
          {noticeSaid(state.home.notice, notice)}
        </p>
      </div>
    </div>
  )
}

const JobsRow = ({ unsure }: { unsure: boolean }): JSX.Element => (
  <Row
    id="jobs"
    counts={jobsLane.useCounts()}
    lane={jobsLane}
    // Read in render: `useCounts` above subscribes to the same Jobs store,
    // so a change to it renders this row again.
    unsure={unsure && jobsLane.keptBefore?.() === true}
  >
    <JobsNotice />
  </Row>
)

const VoiceRow = (): JSX.Element => (
  <Row
    id="voice"
    counts={voiceLane.useCounts()}
    lane={voiceLane}
    unsure={false}
  />
)

/** Each record's own screen, for its row on the status page. */
const PAGES: Readonly<Record<LaneId, BoardPage>> = {
  practice: "practice",
  aph: "aph",
  jobs: "jobs",
  voice: "home-settings",
}

/**
 * One record kept on home, as the status page shows it. `run` is null for
 * aph, whose runs only its own screens watch: its row says where, not how.
 * A run is held only while the app is open and its lane's watch has run
 * (its wing's mark; voice notes' everywhere), so a kept lane with no run
 * this launch says where it will show, never "up to date". An `unsure`
 * choice (made before this phone kept its choices) is said as the ledger
 * says it: its own screen's mark knows.
 */
function laneRow(
  id: LaneId,
  counts: LaneCounts,
  choices: ReturnType<typeof useLaneChoices>,
  run: KeptState | null,
  known: boolean,
  unsure: boolean,
  more: ReadonlyArray<string> = []
): BoardRow {
  if (unsure) {
    return {
      id,
      group: "home",
      name: LEDGER.names[id],
      word: BOARD_WORDS.unsure,
      line: LEDGER.unsure(LEDGER.opens[id]),
      more,
      mark: { kind: "lane", where: "checking", how: null },
      page: PAGES[id],
    }
  }
  const view = laneView(WORDS[id], {
    ...counts,
    known,
    ...choices,
    run: run ?? INITIAL_KEPT,
    away: null,
  })
  const kept = choices.shared.size > 0
  const unseen = kept && (run === null || (run.last === null && !run.running))
  const last = run?.last
  return {
    id,
    group: "home",
    name: LEDGER.names[id],
    word: view.word,
    line: unseen ? BOARD_WORDS.unseen(LEDGER.opens[id]) : view.line,
    more:
      last?.kind === "synced"
        ? [BOARD_WORDS.lastWent(lookedAt(last.at)), ...more]
        : more,
    mark: { kind: "lane", where: view.where, how: unseen ? null : view.how },
    page: PAGES[id],
  }
}

/**
 * Paired by an earlier build, and `scope` never in the log: its choice is
 * one only its own screens know (`lanes.ts`'s `enterEarlier`).
 */
function useUnlogged(): (scope: Scope) => boolean {
  const consent = phoneConsent()
  const log = useSyncExternalStore(consent.subscribe, consent.getSnapshot)
  const { link } = useHomeLink()
  return (scope) =>
    link.kind === "paired" && link.earlier && !everChosen(log, scope)
}

/**
 * Each record kept on home as the status page shows it (#2165): where it is
 * kept and how its last send went, read without a watch of its own
 * (`useLaneRun`), so nothing is sent from the page. Voice notes add what
 * this phone can't send (LA14). `jobsKept`: whether the Jobs record is
 * kept on home, its choice from before the log included, as the morning
 * run's words need it.
 */
export function useLaneRows(): {
  rows: ReadonlyArray<BoardRow>
  jobsKept: boolean
} {
  const known = useHomeLink().link.kind !== "reading"
  const unsent = unsentLines(useUnsendable())
  const unlogged = useUnlogged()
  const jobs = useLaneChoices(jobsLane)
  // Read in render: `useCounts` below subscribes to the same Jobs store.
  const jobsEarlier = unlogged("jobs") && jobsLane.keptBefore?.() === true
  return {
    rows: [
      laneRow(
        "practice",
        practiceLane.useCounts(),
        useLaneChoices(practiceLane),
        useLaneRun(practiceLane),
        known,
        false
      ),
      laneRow(
        "aph",
        NO_COUNTS,
        useLaneChoices(APH_SCOPES),
        null,
        known,
        unlogged("aph")
      ),
      laneRow(
        "jobs",
        jobsLane.useCounts(),
        jobs,
        useLaneRun(jobsLane),
        known,
        jobsEarlier
      ),
      laneRow(
        "voice",
        voiceLane.useCounts(),
        useLaneChoices(voiceLane),
        useLaneRun(voiceLane),
        known,
        false,
        unsent
      ),
    ],
    jobsKept: jobs.shared.size > 0 || jobsEarlier,
  }
}

export const SharingLedger = (): JSX.Element => {
  const consent = phoneConsent()
  const log = useSyncExternalStore(consent.subscribe, consent.getSnapshot)
  const link = useHomeLink()
  const pairing = pairingOf(link)
  const history = historyLines(log, pairing)
  const unlogged = useUnlogged()
  return (
    <section className="space-y-3" aria-labelledby="ledger-heading">
      <div className="space-y-1">
        <Label id="ledger-heading">{LEDGER.title}</Label>
        <p className="text-muted-foreground text-xs">{LEDGER.lead}</p>
      </div>
      <ul className="divide-y rounded-md border px-3">
        <PracticeRow />
        <Row id="aph" counts={NO_COUNTS} lane={null} unsure={unlogged("aph")} />
        <JobsRow unsure={unlogged("jobs")} />
        <VoiceRow />
      </ul>
      <div className="space-y-1">
        <p className="text-sm font-medium">{LEDGER.neverTitle}</p>
        <ul className="space-y-1">
          {LEDGER.never.map((item) => (
            <li key={item.label} className="text-muted-foreground text-xs">
              <span className="text-foreground">{item.label}</span>: {item.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{LEDGER.historyTitle}</p>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {link.link.kind === "paired" && link.link.earlier
              ? LEDGER.noHistoryEarlier
              : LEDGER.noHistory}
          </p>
        ) : (
          <ol className="space-y-0.5">
            {history.map((line) => (
              <li key={line.key} className="text-muted-foreground text-xs">
                {line.text}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

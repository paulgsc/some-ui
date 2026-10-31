/**
 * Settings' readout of what this phone keeps on its paired home (LA15,
 * docs/learner-data-authority.md): one row per record, each kind it holds
 * and how much is on home, what waits on this phone, how the last send went
 * and Send now; what is never sent; and, for voice notes, what this phone
 * can't send and why (LA14). Its words are
 * `lib/home-link/words`'s alone, and it mounts no watch of its own: the app
 * shell drains every lane (`components/device-home-glyph.tsx`), and this
 * reads how that is going (`useLaneView`).
 *
 * The status page's rows for the same records come from here too
 * (`useLaneRows`), each row the one `laneRow` makes: LA8 lets only the
 * modules on its allowlist read the lanes, and this is one.
 */
import type { JSX, ReactNode } from "react"
import { Button, Label, Switch } from "@some-ui/shared"

import { useHomeLink } from "@/lib/home-link"
import { jobsLane } from "@/lib/home-link/jobs"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type {
  Lane,
  LaneCounts,
  LaneId,
  LaneReading,
} from "@/lib/home-link/lanes"
import { askLane, laneReading, useLaneView } from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import { useUnsendable, voiceLane } from "@/lib/home-link/voice"
import {
  KEPT_ON_HOME,
  lookedAt,
  SHEET,
  unsentLines,
} from "@/lib/home-link/words"
import { phoneJobs } from "@/lib/jobs"
import { NOTICE_WORDS, noticeSaid } from "@/lib/jobs/words"
import type { BoardPage, BoardRow } from "@/lib/status-board"
import { BOARD_WORDS } from "@/lib/status-board/words"
import { useJobs } from "@/components/jobs/parts"

const NO_COUNTS: LaneCounts = {
  held: {},
  refused: {},
  waiting: 0,
  hidden: 0,
  pulled: true,
}

/** Each record's own screen, for its row on the status page. */
const PAGES: Readonly<Record<LaneId, BoardPage>> = {
  practice: "practice",
  aph: "aph",
  jobs: "jobs",
  voice: "home-settings",
}

/**
 * aph as Settings and the status page read it: it drains only while its
 * own screens are open, so there is no run here to tell.
 */
function useAphReading(): LaneReading {
  return laneReading("aph", NO_COUNTS, INITIAL_KEPT, useHomeLink())
}

/**
 * One record this phone keeps on home, as Settings and the status page show
 * it. aph's row says where it is kept, and that how its last send went shows
 * on its own screen; `more` adds lines under it (what this phone can't send).
 */
function laneRow(
  id: LaneId,
  { run, paired, view }: LaneReading,
  more: ReadonlyArray<string> = []
): BoardRow {
  const unseen = id === "aph" && paired
  const last = run.last
  return {
    id,
    group: "home",
    name: KEPT_ON_HOME.names[id],
    word: view.word,
    line: unseen ? BOARD_WORDS.unseen(KEPT_ON_HOME.opens[id]) : view.line,
    more:
      last?.kind === "synced"
        ? [BOARD_WORDS.lastWent(lookedAt(last.at)), ...more]
        : more,
    mark: { kind: "lane", where: view.where, how: unseen ? null : view.how },
    page: PAGES[id],
  }
}

const Row = ({
  id,
  reading,
  lane,
  more,
  children,
}: {
  id: LaneId
  reading: LaneReading
  /** The lane Send now asks, or `null` where only its own screens drain it (aph). */
  lane: Lane | null
  /** Lines under the rows: what this phone can't send (voice notes). */
  more?: ReadonlyArray<string>
  children?: ReactNode
}): JSX.Element => {
  const row = laneRow(id, reading, more)
  return (
    <li className="space-y-2 py-3">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-muted-foreground text-xs" role="status">
        {row.line}
      </p>
      <ul className="space-y-0.5">
        {reading.view.rows.map((r) => (
          <li key={r.label} className="text-muted-foreground text-xs">
            {r.label}: {r.text}
          </li>
        ))}
      </ul>
      {[...reading.view.notes, ...row.more].map((note) => (
        <p key={note} className="text-muted-foreground text-xs">
          {note}
        </p>
      ))}
      {children}
      {lane !== null && reading.sendNow ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => askLane(lane)}
        >
          {SHEET.sendNow}
        </Button>
      ) : null}
    </li>
  )
}

const PracticeRow = (): JSX.Element => (
  <Row id="practice" reading={useLaneView(practiceLane)} lane={practiceLane} />
)

const AphRow = (): JSX.Element => (
  <Row id="aph" reading={useAphReading()} lane={null} />
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

const JobsRow = (): JSX.Element => (
  <Row id="jobs" reading={useLaneView(jobsLane)} lane={jobsLane}>
    <JobsNotice />
  </Row>
)

const VoiceRow = (): JSX.Element => (
  <Row
    id="voice"
    reading={useLaneView(voiceLane)}
    lane={voiceLane}
    more={unsentLines(useUnsendable())}
  />
)

/**
 * Each record kept on home as the status page shows it (#2165): where it is
 * kept and how its last send went, read without a watch of its own
 * (`useLaneView`), so nothing is sent from the page. Voice notes add what
 * this phone can't send (LA14). `paired`: whether this phone is paired with
 * home, so the Jobs record goes there, as the morning run's words need it.
 */
export function useLaneRows(): {
  rows: ReadonlyArray<BoardRow>
  paired: boolean
} {
  const practice = useLaneView(practiceLane)
  return {
    rows: [
      laneRow("practice", practice),
      laneRow("aph", useAphReading()),
      laneRow("jobs", useLaneView(jobsLane)),
      laneRow("voice", useLaneView(voiceLane), unsentLines(useUnsendable())),
    ],
    paired: practice.paired,
  }
}

export const KeptOnHome = (): JSX.Element => (
  <section className="space-y-3" aria-labelledby="kept-heading">
    <div className="space-y-1">
      <Label id="kept-heading">{KEPT_ON_HOME.title}</Label>
      <p className="text-muted-foreground text-xs">{KEPT_ON_HOME.lead}</p>
    </div>
    <ul className="divide-y rounded-md border px-3">
      <PracticeRow />
      <AphRow />
      <JobsRow />
      <VoiceRow />
    </ul>
    <div className="space-y-1">
      <p className="text-sm font-medium">{KEPT_ON_HOME.neverTitle}</p>
      <ul className="space-y-1">
        {KEPT_ON_HOME.never.map((item) => (
          <li key={item.label} className="text-muted-foreground text-xs">
            <span className="text-foreground">{item.label}</span>: {item.text}
          </li>
        ))}
      </ul>
    </div>
  </section>
)

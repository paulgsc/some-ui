/**
 * Settings' ledger of what this phone shares with its paired home (LA9 to
 * LA11, docs/learner-data-authority.md): one row per record, each kind it
 * holds with since when and how much is on home, the way to stop, what is
 * never shared, and every choice ever made. Its words are
 * `lib/home-link/words`'s alone; it sends nothing.
 *
 * aph's record comes back to the phone as it stops, which only aph's own
 * screens can do (`@some-ui/aph` is theirs), so its row says where to stop
 * instead of offering it here.
 */
import type { JSX } from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button, Label } from "@some-ui/shared"

import { useHomeLink } from "@/lib/home-link"
import type { Scope } from "@/lib/home-link/consent-model"
import { everChosen } from "@/lib/home-link/consent-model"
import { phoneConsent } from "@/lib/home-link/consent-runtime"
import { jobsLane } from "@/lib/home-link/jobs"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { Lane, LaneCounts, LaneId } from "@/lib/home-link/lanes"
import { pairingOf, stopOnHome, useLaneChoices } from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import {
  historyLines,
  laneView,
  LEDGER,
  SHEET,
  WORDS,
} from "@/lib/home-link/words"

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
}): JSX.Element => {
  const { shared, stopped } = useLaneChoices(lane ?? APH_SCOPES)
  const [confirming, setConfirming] = useState(false)
  const [refused, setRefused] = useState(false)
  const question = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    // The pressed button is gone: the question takes its focus.
    if (confirming) question.current?.focus()
  }, [confirming])
  const words = WORDS[id]
  const view = laneView(words, {
    ...counts,
    known: true,
    shared,
    stopped,
    run: INITIAL_KEPT,
    away: null,
  })
  const kept = shared.size > 0
  return (
    <li className="space-y-2 py-3">
      <p className="text-sm font-medium">{LEDGER.names[id]}</p>
      {unsure ? (
        <p className="text-muted-foreground text-xs">
          {LEDGER.unsure(LEDGER.names[id])}
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

const JobsRow = ({ unsure }: { unsure: boolean }): JSX.Element => (
  <Row
    id="jobs"
    counts={jobsLane.useCounts()}
    lane={jobsLane}
    unsure={unsure && jobsLane.keptBefore?.() === true}
  />
)

export const SharingLedger = (): JSX.Element => {
  const consent = phoneConsent()
  const log = useSyncExternalStore(consent.subscribe, consent.getSnapshot)
  const link = useHomeLink()
  const pairing = pairingOf(link)
  const history = historyLines(log, pairing)
  /** Paired by an earlier build, and `scope` never in the log. */
  const unlogged = (scope: Scope): boolean =>
    link.link.kind === "paired" && link.link.earlier && !everChosen(log, scope)
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
          <p className="text-muted-foreground text-xs">{LEDGER.noHistory}</p>
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

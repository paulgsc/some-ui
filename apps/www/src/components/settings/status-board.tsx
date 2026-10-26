/**
 * The status page (#2165): every process this phone runs, how it last went,
 * and which need their person. A glance strip of every mark, then one row
 * per process: the ones that need you first, the rest by context. Each row
 * draws its own surface's mark (`../sharing-marks`, J0's `StateIcon`,
 * topik's `RoutineMarks`) and
 * says its surface's words; `lib/status-board` only orders them. Each row
 * opens the page that owns it. It reads; it sends nothing.
 */
import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { MarkLegend } from "@some-ui/shared"
// Only the status route imports this module, and route splitting makes that
// route its own lazy chunk, so this static edge costs no host anything eagerly.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import {
  RoutineLegend,
  RoutineMarks,
  routineTone,
  useRoutineStatus,
} from "@some-ui/topik"
import { Link } from "@tanstack/react-router"
import { ChevronRight, EyeOff } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import { useMinuteClock } from "@/lib/clock"
import { phoneJobs } from "@/lib/jobs"
import type { JourneyContext } from "@/lib/jobs/journey"
import { kindJourney } from "@/lib/jobs/journey"
import {
  MORNING_IDS,
  MORNING_LEGEND,
  morningOf,
  morningSign,
  morningStop,
  morningTheme,
} from "@/lib/jobs/morning"
import { JOURNEY_IDS, signOf, stateTitle, stopOf, themeOf } from "@/lib/journey"
import type { How } from "@/lib/sharing-marks"
import { MARK_WORDS } from "@/lib/sharing-marks"
import type { BoardPage, BoardRow, Look, RowMark } from "@/lib/status-board"
import {
  boardOf,
  glanceOf,
  journeyRow,
  morningRow,
  routineRow,
} from "@/lib/status-board"
import { BOARD_WORDS, LOOK_WORDS } from "@/lib/status-board/words"
import { useJobs } from "@/components/jobs/parts"
import { StateIcon, themeText } from "@/components/journey-status"
import { useHomeRoutineFiles } from "@/components/player/device-routine-files"
import { useLookRow } from "@/components/settings/device-routine-reads"
import { useLaneRows } from "@/components/settings/device-sharing-ledger"
import {
  HOW_TONE,
  HowMark,
  SharingLegend,
  toneOf,
  WHERE_TONE,
  WhereMark,
} from "@/components/sharing-marks"

/** Every look, in the order its legend says them. */
const LOOKS: ReadonlyArray<Look> = [
  "read",
  "busy",
  "unreachable",
  "forgotten",
  "failed",
  "not-yet",
  "off",
]

/** A look home answered is an exchange, drawn as the sharing mark's `how`. */
const LOOK_HOW: Readonly<Record<Exclude<Look, "off" | "not-yet">, How>> = {
  read: "current",
  busy: "busy",
  unreachable: "no-answer",
  forgotten: "forgotten",
  failed: "failed",
}

const lookTone = (look: Look): string =>
  look === "off" || look === "not-yet"
    ? "text-muted-foreground"
    : HOW_TONE[LOOK_HOW[look]]

/** Korean's look: off, not yet (a ring, as "checking"), or how it went. */
const LookMark = ({
  look,
  className,
}: {
  look: Look
  className?: string
}): JSX.Element =>
  look === "off" ? (
    <EyeOff aria-hidden data-look={look} className={className} />
  ) : look === "not-yet" ? (
    <WhereMark where="checking" className={className} />
  ) : (
    <HowMark how={LOOK_HOW[look]} className={className} />
  )

const toneOfMark = (mark: RowMark): string =>
  mark.kind === "lane"
    ? toneOf(mark.where, mark.how)
    : mark.kind === "journey"
      ? themeText(mark.theme)
      : mark.kind === "routine"
        ? routineTone(mark.shape)
        : lookTone(mark.look)

/** A row's mark, as its own surface draws it. */
const RowMarkView = ({ mark }: { mark: RowMark }): JSX.Element => {
  if (mark.kind === "journey") {
    return <StateIcon at={mark.at} sign={mark.sign} theme={mark.theme} small />
  }
  if (mark.kind === "routine") {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <RoutineMarks shape={mark.shape} voice={mark.voice} small />
      </span>
    )
  }
  if (mark.kind === "look") {
    return (
      <LookMark
        look={mark.look}
        className={cn("size-5 shrink-0", lookTone(mark.look))}
      />
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <WhereMark
        where={mark.where}
        className={cn("size-5", WHERE_TONE[mark.where])}
      />
      {mark.how === null ? null : (
        <HowMark how={mark.how} className={cn("size-4", HOW_TONE[mark.how])} />
      )}
    </span>
  )
}

/** Where each row leads: the Android app's pages, as this page is one. */
const PAGES: Readonly<Record<BoardPage, string>> = {
  practice: "/practice",
  aph: "/aph",
  jobs: "/jobs",
  "home-settings": "/settings/home",
}

/** The rows lead to the Android app's pages, so only its build links them. */
const LINKED = hasAudience("apk")

const ROW = "flex items-start gap-3 rounded-lg p-3"

const Row = ({ row }: { row: BoardRow }): JSX.Element => {
  const body = (
    <>
      <span className="mt-0.5 flex w-8 shrink-0 justify-center">
        <RowMarkView mark={row.mark} />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium">{row.name}</span>
        <span className={cn("block text-sm break-words", toneOfMark(row.mark))}>
          {row.word}
        </span>
        <span className="text-muted-foreground block text-xs break-words">
          {row.line}
        </span>
        {row.more.map((line) => (
          <span
            key={line}
            className="text-muted-foreground block text-xs break-words"
          >
            {line}
          </span>
        ))}
      </span>
    </>
  )
  return (
    <li>
      {LINKED ? (
        <Link
          to={PAGES[row.page]}
          className={cn(
            ROW,
            "hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
          )}
        >
          {body}
          <ChevronRight
            aria-hidden
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
        </Link>
      ) : (
        <div className={ROW}>{body}</div>
      )}
    </li>
  )
}

const Group = ({
  title,
  rows,
  urgent = false,
}: {
  title: string
  rows: ReadonlyArray<BoardRow>
  urgent?: boolean
}): JSX.Element => (
  <section aria-label={title} className="space-y-1">
    <h2
      className={cn(
        "px-1 text-xs font-medium tracking-wider uppercase",
        urgent ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {title}
    </h2>
    <ul
      className={cn(
        "divide-y rounded-xl border",
        urgent && "border-destructive/40"
      )}
    >
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </ul>
  </section>
)

/** Every mark the board can draw, by context, and what each means. */
const Legends = (): JSX.Element => (
  <details className="rounded-xl border p-3">
    <summary className="cursor-pointer text-sm font-medium">
      {MARK_WORDS.title}
    </summary>
    <div className="mt-3 space-y-4">
      <SharingLegend away={false} title={BOARD_WORDS.sharingLegend} />
      <MarkLegend
        title={BOARD_WORDS.morning}
        lines={MORNING_IDS.map((id) => ({
          key: id,
          mark: (
            <StateIcon
              at={morningStop(id)}
              sign={morningSign(id)}
              theme={morningTheme(id)}
              small
            />
          ),
          text: MORNING_LEGEND[id],
        }))}
      />
      <MarkLegend
        title={BOARD_WORDS.filesLegend}
        lines={JOURNEY_IDS.map((id) => ({
          key: id,
          mark: (
            <StateIcon
              at={stopOf(id)}
              sign={signOf(id)}
              theme={themeOf(id)}
              small
            />
          ),
          text: stateTitle(id, "them"),
        }))}
      />
      <RoutineLegend title={BOARD_WORDS.routine} />
      <MarkLegend
        title={LOOK_WORDS.name}
        lines={LOOKS.map((look) => ({
          key: look,
          mark: (
            <LookMark
              look={look}
              className={cn("size-5 shrink-0", lookTone(look))}
            />
          ),
          text: LOOK_WORDS.legend[look],
        }))}
      />
    </div>
  </details>
)

export const StatusBoard = (): JSX.Element => {
  const lanes = useLaneRows()
  const look = useLookRow()
  const { state } = useJobs()
  const now = useMinuteClock()
  const routineFiles = useHomeRoutineFiles()
  const routine = useRoutineStatus(routineFiles?.key ?? "", now)
  const files: JourneyContext = {
    state,
    kept: lanes.jobsKept,
    outgoing: phoneJobs().keeping.outgoing,
  }
  const rows = [
    ...lanes.rows,
    morningRow(morningOf(state, lanes.jobsKept, now), now),
    ...(["decisions", "scouts"] as const).flatMap((kind) => {
      const j = kindJourney(files, kind)
      return j === null ? [] : [journeyRow(kind, j, now)]
    }),
    // The routine's runs reach this phone only while Korean shows its files.
    ...(routineFiles === undefined ? [] : [routineRow(routine)]),
    ...(look === null ? [] : [look]),
  ]
  const board = boardOf(rows)
  return (
    <div className="space-y-5">
      <section aria-label={BOARD_WORDS.glance} className="space-y-2">
        <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wider uppercase">
          {BOARD_WORDS.glance}
        </h2>
        <ul className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          {glanceOf(board).map((row) => (
            <li key={row.id} title={`${row.name}: ${row.word}`}>
              <RowMarkView mark={row.mark} />
              <span className="sr-only">{`${row.name}: ${row.word}`}</span>
            </li>
          ))}
        </ul>
      </section>
      {board.needsYou.length > 0 ? (
        <Group title={BOARD_WORDS.needsYou} rows={board.needsYou} urgent />
      ) : null}
      {board.groups.map((group) => (
        <Group
          key={group.id}
          title={BOARD_WORDS.groups[group.id]}
          rows={group.rows}
        />
      ))}
      <Legends />
    </div>
  )
}

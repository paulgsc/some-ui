/**
 * Studio's time log (STUDIO ST9): time comes from the screens, not a
 * stopwatch. Each sitting's screens entered and left and the page hidden or
 * shown are logged, append-only, in the shape home keeps them (paulgsc/server
 * `routes::studio_log`), and time per screen is a pure fold over the log.
 *
 * - **Derived, never asked for.** `logBetween` compares what one Studio
 *   state shows with the next and says what happened; the machine never
 *   logs anything itself, so no screen can forget to.
 * - **Only inside a sitting.** Events are logged while a sitting is open on
 *   the video on screen, and every one names it (`sittingKey`).
 * - **A gap is not time.** The fold counts nothing while the page is hidden,
 *   and nothing across a gap longer than `SITTING_GAP_MS` (Jobs' rule,
 *   `apps/www/src/lib/jobs/model.ts`): that is a sitting left, not worked.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Project, Sitting } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"

import type { StudioState } from "./machine"
import { projectOf } from "./machine"
import type { SittingKind } from "./words"
import { SITTING_KINDS, STUDIO_WORDS } from "./words"

export const SITTING_GAP_MS = 30 * 60_000

export const TIME_EVENT_TYPES = [
  "sitting_opened",
  "sitting_closed",
  "screen_entered",
  "screen_left",
  "page_hidden",
  "page_shown",
] as const

type TimeEventType = (typeof TIME_EVENT_TYPES)[number]

/** One entry of the log, as home keeps it. */
export type TimeEvent = {
  /** Letters, digits, `_` and `-`. */
  readonly id: string
  /** ISO 8601, UTC. */
  readonly at: string
  /** The sitting it happened in (`sittingKey`). */
  readonly sitting: string
  readonly kind: SittingKind
  readonly type: TimeEventType
  /** The screen entered or left; null for the other types. */
  readonly screen: string | null
}

/** What a state shows, as far as the log is concerned. */
type Seen = {
  readonly sitting: string | null
  readonly screen: string | null
  readonly visible: boolean
  /** The sitting's kind as the screen shows it; Record's for Start and Done. */
  readonly kind: SittingKind
}

/**
 * A sitting's name in the log, unique on this phone and within home's
 * limits: its id in its project and when it opened, digits and letters.
 */
export function sittingKey(sitting: Pick<Sitting, "id" | "openedAt">): string {
  return `${sitting.id}-${sitting.openedAt.replace(/[^0-9A-Za-z]/g, "")}`
}

function openSitting(project: Project | null): Sitting | null {
  const last = project?.sittings.at(-1)
  return last?.closedAt === null ? last : null
}

const kindOf = (state: StudioState): SittingKind =>
  SITTING_KINDS.find((kind) => kind === state.screen.kind) ?? "record"

/** The screen a state shows: `start`, `record:<shot>`, `watch`, `done`… */
function screenOf(state: StudioState): string {
  const { screen } = state
  return screen.kind === "record" ? `record:${screen.shot}` : screen.kind
}

function seen(state: StudioState): Seen {
  const sitting = openSitting(projectOf(state))
  return {
    sitting: sitting === null ? null : sittingKey(sitting),
    screen: state.page === "left" ? null : screenOf(state),
    kind: kindOf(state),
    visible: state.visible && state.page !== "left",
  }
}

/**
 * What happened between `before` and `after`, in order, at `at`, each with
 * a fresh id from `newId`. Empty when nothing the log keeps changed.
 */
export function logBetween(
  before: StudioState,
  after: StudioState,
  at: string,
  newId: () => string
): ReadonlyArray<TimeEvent> {
  const was = seen(before)
  const now = seen(after)
  const events: Array<TimeEvent> = []
  const add = (
    { sitting, kind }: { sitting: string; kind: SittingKind },
    type: TimeEventType,
    screen: string | null = null
  ): void => {
    events.push({ id: newId(), at, sitting, kind, type, screen })
  }
  const sittingChanged = was.sitting !== now.sitting
  if (was.sitting !== null) {
    const leaving = sittingChanged || was.screen !== now.screen
    if (leaving && was.screen !== null)
      add({ sitting: was.sitting, kind: was.kind }, "screen_left", was.screen)
    if (!sittingChanged && was.visible && !now.visible)
      add({ sitting: was.sitting, kind: was.kind }, "page_hidden")
    if (sittingChanged)
      add({ sitting: was.sitting, kind: was.kind }, "sitting_closed")
  }
  if (now.sitting !== null) {
    if (sittingChanged)
      add({ sitting: now.sitting, kind: now.kind }, "sitting_opened")
    if (!sittingChanged && !was.visible && now.visible)
      add({ sitting: now.sitting, kind: now.kind }, "page_shown")
    const entering = sittingChanged || was.screen !== now.screen
    if (entering && now.screen !== null)
      add(
        { sitting: now.sitting, kind: now.kind },
        "screen_entered",
        now.screen
      )
    // A sitting can open while the page is hidden, its write landing late.
    if (sittingChanged && !now.visible)
      add({ sitting: now.sitting, kind: now.kind }, "page_hidden")
  }
  return events
}

/**
 * Time per screen over `events`, in ms: from each screen entered to what
 * ends it (leaving it, the page hidden, the sitting closed), never across a
 * gap longer than `SITTING_GAP_MS`. A screen still open at the log's end
 * counts up to its last event.
 */
export function timePerScreen(
  events: ReadonlyArray<TimeEvent>
): ReadonlyMap<string, number> {
  const totals = new Map<string, number>()
  const bySitting = new Map<string, Array<TimeEvent>>()
  for (const event of events) {
    const list = bySitting.get(event.sitting) ?? []
    list.push(event)
    bySitting.set(event.sitting, list)
  }
  for (const list of bySitting.values()) {
    const ordered = [...list].sort((a, b) => a.at.localeCompare(b.at))
    let screen: string | null = null
    let visible = true
    let since = 0
    const count = (until: number): void => {
      const span = until - since
      if (screen !== null && visible && span > 0 && span <= SITTING_GAP_MS) {
        totals.set(screen, (totals.get(screen) ?? 0) + span)
      }
      since = until
    }
    for (const event of ordered) {
      const t = Date.parse(event.at)
      count(t)
      switch (event.type) {
        case "screen_entered": {
          screen = event.screen
          break
        }
        case "screen_left":
        case "sitting_closed": {
          screen = null
          break
        }
        case "page_hidden": {
          visible = false
          break
        }
        case "page_shown":
        case "sitting_opened": {
          visible = true
          break
        }
        default: {
          assertNever(event.type)
        }
      }
    }
  }
  return totals
}

/** A screen as Time spent names it: Start, Scene 2, Done for now… */
function screenName(project: Project, screen: string): string {
  const words = STUDIO_WORDS.time.screens
  if (screen.startsWith("record:")) {
    const shot = screen.slice("record:".length)
    const n =
      latest(project).cutList.shots.findIndex((each) => each.id === shot) + 1
    return n === 0 ? words.droppedScene : words.scene(n)
  }
  const named: Readonly<Record<string, string>> = words.named
  return named[screen] ?? words.other
}

/** Time spent on this video, per screen, most first; from its sittings' log. */
export function timeView(
  project: Project,
  log: ReadonlyArray<TimeEvent>
): ReadonlyArray<{ readonly name: string; readonly ms: number }> {
  const mine = new Set(project.sittings.map(sittingKey))
  const totals = new Map<string, number>()
  for (const [screen, ms] of timePerScreen(
    log.filter((event) => mine.has(event.sitting))
  )) {
    const name = screenName(project, screen)
    totals.set(name, (totals.get(name) ?? 0) + ms)
  }
  return [...totals]
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => b.ms - a.ms)
}

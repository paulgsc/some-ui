import type { JSX } from "react"
import { useEffect } from "react"
import { AphTodayCard, AphTodayEntries } from "@some-ui/aph"
import { cn } from "@some-ui/core-utils"
import { Button, Skeleton } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BookOpen, Check, Mic } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { hasLapsed, latestStop, REASONS, settle } from "@/lib/session-stop"
import type { SessionRecord } from "@/lib/tenant"
import {
  finishedToday,
  resumableSession,
  sessionsQuery,
  useSessions,
  useUpdateSession,
} from "@/lib/tenant"
import { formatRemaining } from "@/lib/wind-down"
import { StopReasons } from "@/components/player/session-stop"

/**
 * Home: the Android app's front door, where each daily tool shows what it
 * needs from me right now. A tool earns one card here, plus its rows in
 * "Today so far"; anything more belongs on its own screen, a tab away.
 *
 * Each tool's card is its own (aph's comes from `@some-ui/aph`, which owns
 * what "due" means); Home only lays them out and supplies the links.
 */

type StudyStatus =
  | { kind: "pending" }
  | { kind: "failed"; retry: () => void }
  | {
      kind: "ready"
      open: SessionRecord | null
      /** Finished today: with nothing open, the card says so and offers more. */
      today: ReadonlyArray<SessionRecord>
      /** The list shown is cached; refreshing it just failed. */
      refreshRetry: (() => void) | null
    }

/** The done card's line: "15 min · Korean", or "2 sessions · 33 min". */
function studiedLine(today: ReadonlyArray<SessionRecord>): string {
  const minutes = Math.max(
    1,
    Math.round(
      today.reduce((sum, s) => sum + (s.finalElapsedMs ?? 0), 0) / 60_000
    )
  )
  const only = today.length === 1 ? today[0] : undefined
  return only
    ? `${minutes} min · ${only.name}`
    : `${today.length} sessions · ${minutes} min`
}

/**
 * The study card's honest states: still loading; failed (never read as
 * "nothing in progress", which would offer Start over a session that is
 * only unreadable); and known, which says so when what it shows is a cached
 * list whose refresh just failed. Known with nothing open and something
 * finished today, it says so in the success colour and still offers another
 * round.
 */
const StudyCard = ({ now }: { now: Date }): JSX.Element => {
  const outcome = queryOutcome(useSessions())
  const status = matchQueryOutcome(outcome, {
    pending: (): StudyStatus => ({ kind: "pending" }),
    failed: (_error, retry): StudyStatus => ({ kind: "failed", retry }),
    ready: (sessions, refreshError): StudyStatus => ({
      kind: "ready",
      open: resumableSession(sessions),
      today: finishedToday(sessions, now),
      refreshRetry: refreshError?.retry ?? null,
    }),
  })

  const done =
    status.kind === "ready" && status.open === null && status.today.length > 0

  // An open session's stop: still within reach, or past it and closed here,
  // as it stood, so it counts today and stops offering a pick-up.
  const openStop =
    status.kind === "ready" && status.open ? latestStop(status.open.id) : null
  const stopped = openStop?.outcome === "open" ? openStop : null
  const lapsed = stopped && hasLapsed(stopped, now) ? stopped : null
  const { mutate: updateSession } = useUpdateSession()
  useEffect(() => {
    if (lapsed === null) return
    settle(lapsed, "lapsed")
    updateSession({
      id: lapsed.sessionId,
      patch: {
        status: "completed",
        completedAt: lapsed.stoppedAt,
        finalElapsedMs: lapsed.elapsedMs,
      },
    })
  }, [lapsed, updateSession])

  // The latest finished session, if it was cut short: Home asks why once.
  const lastStop =
    done && status.today[0] ? latestStop(status.today[0].id) : null
  const cut =
    lastStop?.outcome === "done" || lastStop?.outcome === "lapsed"
      ? lastStop
      : null

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        done
          ? "border-success/30 bg-success/10 animate-in fade-in duration-700"
          : "bg-card"
      )}
    >
      <div className="flex items-center gap-3">
        {done ? (
          <span className="bg-success text-success-foreground animate-in zoom-in-50 flex size-10 shrink-0 items-center justify-center rounded-full duration-500">
            <Check aria-hidden className="size-5" strokeWidth={3} />
          </span>
        ) : (
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
            <BookOpen aria-hidden className="size-5" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("font-semibold", done && "text-success")}>
            {done ? "Studied today" : "Study"}
          </span>
          {status.kind === "pending" && <Skeleton className="mt-1 h-4 w-32" />}
          {status.kind === "failed" && (
            <span className="text-destructive truncate text-sm">
              couldn’t read your sessions
            </span>
          )}
          {status.kind === "ready" && (
            <span className="text-muted-foreground truncate text-sm">
              {status.open !== null
                ? stopped
                  ? `Stopped at ${formatRemaining(stopped.elapsedMs)} · ${status.open.name}`
                  : status.open.name
                : done
                  ? studiedLine(status.today)
                  : "nothing in progress"}
            </span>
          )}
        </span>
        {status.kind === "failed" && (
          <Button size="sm" variant="outline" onClick={status.retry}>
            Retry
          </Button>
        )}
        {status.kind === "ready" && (
          <Button
            asChild
            size="sm"
            variant={status.open === null ? "outline" : "default"}
          >
            {status.open === null ? (
              <Link to="/sessions/new">{done ? "Another round" : "Start"}</Link>
            ) : (
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: status.open.id }}
              >
                {stopped ? "Pick up" : "Resume"}
              </Link>
            )}
          </Button>
        )}
      </div>
      {cut && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Cut short at {formatRemaining(cut.elapsedMs)}
            {cut.reason
              ? `: ${REASONS.find(([id]) => id === cut.reason)?.[1] ?? ""}`
              : "."}
          </p>
          {cut.reason === null && (
            <StopReasons key={cut.stoppedAt} stop={cut} from="home" />
          )}
        </div>
      )}
      {status.kind === "ready" && status.refreshRetry !== null && (
        <p
          role="status"
          className="text-destructive flex items-center gap-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            Couldn’t refresh; this may be out of date.
          </span>
          <Button size="sm" variant="ghost" onClick={status.refreshRetry}>
            Retry
          </Button>
        </p>
      )}
      {!done && (
        <Link
          to="/soundbites"
          search={{ say: "sessions" }}
          className="text-muted-foreground flex items-center gap-1.5 self-end text-sm underline-offset-4 hover:underline"
        >
          <Mic aria-hidden className="size-3.5" />
          Not today? Say why
        </Link>
      )}
    </div>
  )
}

const TodayRoute = (): JSX.Element => {
  // Moves while Home stays open, so a checkpoint turns due, then missed, and
  // the date turns over, without leaving the page.
  const now = useMinuteClock()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header className="flex flex-col">
        <span className="text-muted-foreground text-sm">
          {now.toLocaleDateString("en-US", { weekday: "long" })}
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </h1>
      </header>

      <section aria-labelledby="home-now" className="flex flex-col gap-2">
        <h2
          id="home-now"
          className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
        >
          Now
        </h2>
        <AphTodayCard
          now={now}
          renderLog={(label) => (
            <Button asChild size="sm">
              <Link to="/aph">{label}</Link>
            </Button>
          )}
          renderReview={(children) => (
            <Link
              to="/aph/history"
              className="self-start underline-offset-4 hover:underline"
            >
              {children}
            </Link>
          )}
        />
        <StudyCard now={now} />
      </section>

      <section aria-labelledby="home-today" className="flex flex-col gap-2">
        <h2
          id="home-today"
          className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
        >
          Today so far
        </h2>
        <ul className="bg-card divide-y rounded-xl border">
          <AphTodayEntries
            now={now}
            empty={
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                Nothing logged yet today
              </li>
            }
          />
        </ul>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/today")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: TodayRoute,
})

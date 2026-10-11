import type { JSX } from "react"
import { useEffect } from "react"
import { AphTodayCard, AphTodayEntries } from "@some-ui/aph"
import { cn } from "@some-ui/core-utils"
import {
  BrandMark,
  Button,
  Skeleton,
  StudyGlyph,
  TalkGlyph,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { formatTimecode } from "@/lib/format"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import {
  closedPatch,
  closingStop,
  cutShortStop,
  latestStop,
  REASONS,
} from "@/lib/session-stop"
import { touchedToday } from "@/lib/study-nudge"
import type { SessionRecord } from "@/lib/tenant"
import {
  resumableSession,
  sessionsQuery,
  useSessions,
  useUpdateSession,
} from "@/lib/tenant"
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

function studiedLine(today: ReadonlyArray<SessionRecord>): string {
  const minutes = Math.max(
    1,
    Math.round(
      today.reduce(
        (sum, s) => sum + (s.finalElapsedMs ?? s.totalDurationMs),
        0
      ) / 60_000
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
 * list whose refresh just failed.
 */
const StudyCard = ({ now }: { now: Date }): JSX.Element => {
  const outcome = queryOutcome(useSessions())
  const status = matchQueryOutcome(outcome, {
    pending: (): StudyStatus => ({ kind: "pending" }),
    failed: (_error, retry): StudyStatus => ({ kind: "failed", retry }),
    ready: (sessions, refreshError): StudyStatus => ({
      kind: "ready",
      open: resumableSession(sessions),
      today: sessions.filter(
        (s) => s.status === "completed" && touchedToday(s, now)
      ),
      refreshRetry: refreshError?.retry ?? null,
    }),
  })

  const done =
    status.kind === "ready" && status.open === null && status.today.length > 0

  // An open session stopped past its window closes here, as it stood, and
  // a close whose write failed is retried each minute Home is open.
  const openId = status.kind === "ready" ? (status.open?.id ?? null) : null
  const openStop = openId === null ? null : latestStop(openId)
  const stopped = openStop?.outcome === "open" ? openStop : null
  const { mutate: updateSession } = useUpdateSession()
  const minute = now.getTime()
  useEffect(() => {
    const closing =
      openId === null ? null : closingStop(openId, new Date(minute))
    if (closing)
      updateSession({ id: closing.sessionId, patch: closedPatch(closing) })
  }, [openId, minute, updateSession])

  const lastFinished = done
    ? status.today.reduce((a, b) =>
        (b.completedAt ?? "") > (a.completedAt ?? "") ? b : a
      )
    : null
  const cut = lastFinished && cutShortStop(lastFinished.id)

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 shadow-sm",
        done
          ? "border-success/30 bg-success/10 animate-in fade-in duration-700"
          : "bg-card border-border/50"
      )}
    >
      <div className="flex items-center gap-3">
        {done ? (
          <span className="bg-success text-success-foreground animate-in zoom-in-50 flex size-12 shrink-0 items-center justify-center rounded-full duration-500">
            <Check aria-hidden className="size-5" strokeWidth={3} />
          </span>
        ) : (
          <span className="bg-brand/30 text-brand-foreground dark:text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <StudyGlyph aria-hidden className="size-6" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("font-bold", done && "text-success")}>
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
                  ? `Stopped at ${formatTimecode(stopped.elapsedMs)} · ${status.open.name}`
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
            Cut short at {formatTimecode(cut.elapsedMs)}
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
          className="bg-muted text-muted-foreground hover:text-foreground flex items-center gap-2 self-start rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-medium"
        >
          <TalkGlyph aria-hidden className="size-4" />
          Not today? Say why
        </Link>
      )}
    </div>
  )
}

/**
 * Two low hills along the bottom of the screen, a shade off the ground, so a
 * tall phone's Home ends in a landscape and not in an empty field. Fixed to
 * the viewport, and below the cards in the column's own stacking context
 * (`relative z-[1]` lifts that column over the shell's background, `-z-10`
 * keeps the hills under its content). Capped at a quarter of the height so
 * a phone held sideways keeps its header clear.
 */
const Hills = (): JSX.Element => (
  <svg
    aria-hidden
    viewBox="0 0 390 220"
    preserveAspectRatio="none"
    className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[min(13.75rem,25vh)] w-full"
  >
    <ellipse
      cx="80"
      cy="230"
      rx="230"
      ry="120"
      style={{
        fill: "color-mix(in oklab, var(--muted) 45%, var(--background))",
      }}
    />
    <ellipse
      cx="330"
      cy="240"
      rx="210"
      ry="130"
      style={{
        fill: "color-mix(in oklab, var(--muted) 70%, var(--background))",
      }}
    />
  </svg>
)

const TodayRoute = (): JSX.Element => {
  // Moves while Home stays open, so a checkpoint turns due, then missed, and
  // the date turns over, without leaving the page.
  const now = useMinuteClock()

  return (
    <div className="relative z-[1] mx-auto flex w-full max-w-md flex-col gap-6">
      <Hills />
      <header className="flex items-center gap-3">
        <BrandMark tone="brand" className="size-12 shrink-0" />
        <span className="flex flex-col">
          <span className="text-muted-foreground text-sm font-semibold">
            {now.toLocaleDateString("en-US", { weekday: "long" })}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            {now.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </h1>
        </span>
      </header>

      <section aria-labelledby="home-now" className="flex flex-col gap-3">
        <h2 id="home-now" className="text-lg font-bold">
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

      <section aria-labelledby="home-today" className="flex flex-col gap-3">
        <h2 id="home-today" className="text-lg font-bold">
          Today so far
        </h2>
        <ul className="bg-card border-border/50 divide-border/50 divide-y rounded-2xl border shadow-sm">
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

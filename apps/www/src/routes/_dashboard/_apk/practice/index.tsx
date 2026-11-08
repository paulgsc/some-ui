import type { JSX } from "react"
import { useEffect, useMemo, useState } from "react"
import { cn, formatTimecode } from "@some-ui/core-utils"
import type { Offer, Visit } from "@some-ui/engagement"
import { pageVisit, watchVisit } from "@some-ui/engagement"
import { useShelf } from "@some-ui/react-hooks"
import {
  RUST_ROUNDS_TITLE,
  rustRoundsEntry,
  rustWeekEntry,
} from "@some-ui/rust-rounds/entry"
import {
  BrandMark,
  Button,
  Notice,
  Skeleton,
  StudyGlyph,
  TalkGlyph,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, SquareTerminal } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { isOfferedActivityId } from "@/lib/playable"
import { HOME_OFFERS, studyCardOffers } from "@/lib/practice-home"
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
import { browserLocalStorage } from "@/lib/tenant/storage"
import { StopReasons } from "@/components/player/session-stop"
import { NextLesson } from "@/components/practice/next-lesson"

const SAY_WHY = [HOME_OFFERS.sayWhy]
const RUST_ROUNDS = [HOME_OFFERS.rustRounds]

/**
 * Practice's Home: where studying picks up. What is open, what was finished
 * today, a way to say why not, and Rust Rounds; nothing from another wing
 * (lib/wings).
 * Opened from the foyer, from Practice's own launcher icon, and from the
 * player when a session ends.
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
const StudyCard = ({
  now,
  visit,
}: {
  now: Date
  visit: Visit
}): JSX.Element => {
  const [launching, setLaunching] = useState(false)
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
  const refreshRetry = status.kind === "ready" ? status.refreshRetry : null

  // An open session stopped past its window closes here, as it stood, and
  // a close whose write failed is retried each minute this Home is open.
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

  const lessons =
    status.kind === "ready" &&
    (status.open === null || launching) &&
    isOfferedActivityId("topik")
  // While a lesson launches, its new session can show as open before Home
  // leaves: what was offered at the press stands, so nothing new is offered.
  const open = openId !== null && !launching
  const read = status.kind === "ready"
  const studyOffers = useMemo(
    () => (read ? studyCardOffers({ open, lessons }) : null),
    [read, open, lessons]
  )
  useShelf(visit, "study", studyOffers)
  useShelf(visit, "bites", done ? null : SAY_WHY)
  // A visit takes each offer once, so a second press (or a retry after the
  // app came back) of the same button takes nothing twice.
  const launch = (offer: Offer): void => {
    visit.take(offer)
    setLaunching(true)
  }

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
              <Link
                to="/sessions/new"
                onClick={() => visit.take(HOME_OFFERS.start)}
              >
                {done ? "Another round" : "Start"}
              </Link>
            ) : (
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: status.open.id }}
                onClick={() => visit.take(HOME_OFFERS.resume)}
              >
                {stopped ? "Pick up" : "Resume"}
              </Link>
            )}
          </Button>
        )}
      </div>
      {lessons && (
        <div className="flex flex-wrap gap-2">
          <NextLesson
            className="h-12 rounded-2xl px-6 text-base"
            onLaunch={() => launch(HOME_OFFERS.nextLesson)}
          />
          <NextLesson
            open="menu"
            variant="outline"
            className="h-12 rounded-2xl px-6 text-base"
            onLaunch={() => launch(HOME_OFFERS.hungry)}
          />
        </div>
      )}
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
      {refreshRetry !== null && (
        <Notice
          tone="warning"
          dismissible
          action={{ label: "Retry", onClick: refreshRetry }}
        >
          Couldn’t refresh; this may be out of date.
        </Notice>
      )}
      {!done && (
        <Link
          to="/soundbites"
          search={{ say: "sessions" }}
          onClick={() => visit.take(HOME_OFFERS.sayWhy)}
          className="bg-muted/40 text-muted-foreground hover:text-foreground flex items-center gap-2 self-start rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-medium"
        >
          <TalkGlyph aria-hidden className="size-4" />
          Not today? Say why
        </Link>
      )}
    </div>
  )
}

/**
 * Rust Rounds' way in (#2235, the owner's D2): one tap opens the week open
 * now, saying its deadline and how many tickets are said (RR13); while the
 * phone holds no week, the card left last, or one tap from the first.
 */
const RustRoundsCard = ({ visit }: { visit: Visit }): JSX.Element => {
  // Read once as Home opens, never on each render; it changes only in Rust
  // Rounds itself, which is left to come back here. The week open now
  // (RR13), or, while the phone holds none, where the rounds were left.
  /* eslint-disable owner-guard/no-mount-snapshot -- read once as Home opens, as the line above says: Rust Rounds is left to come back here, which mounts Home afresh */
  const [line] = useState(
    () =>
      rustWeekEntry(browserLocalStorage, Date.now()) ??
      rustRoundsEntry(browserLocalStorage)
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useShelf(visit, "rust-rounds", RUST_ROUNDS)
  return (
    <Link
      to="/rust-rounds"
      onClick={() => visit.take(HOME_OFFERS.rustRounds)}
      className="bg-card border-border/50 flex items-center gap-3 rounded-2xl border p-4 shadow-sm"
    >
      <span className="bg-brand/30 text-brand-foreground dark:text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl">
        <SquareTerminal aria-hidden className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">{RUST_ROUNDS_TITLE}</span>
        <span className="text-muted-foreground text-sm">{line}</span>
      </span>
    </Link>
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

const PracticeHome = (): JSX.Element => {
  // Moves while the page stays open, so a stop's pick-up window closes and
  // the date turns over without leaving it.
  const now = useMinuteClock()
  // What Home offers and which the owner takes (ENGAGE, `pageVisit`): a
  // visit ends when Home closes or the app goes to the back. In
  // development's StrictMode the double mount ends one visit at once.
  const [visit] = useState(() => pageVisit(document))
  useEffect(() => watchVisit(visit, document), [visit])

  return (
    <div className="relative z-[1] mx-auto flex w-full max-w-md flex-col gap-6">
      <Hills />
      <header className="flex items-center gap-3">
        <BrandMark tone="brand" className="size-12 shrink-0" />
        <span className="flex flex-col">
          <span className="text-muted-foreground text-sm font-semibold">
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Practice</h1>
        </span>
      </header>

      <StudyCard now={now} visit={visit} />
      <RustRoundsCard visit={visit} />
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/practice/")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: PracticeHome,
})

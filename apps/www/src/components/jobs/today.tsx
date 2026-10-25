/**
 * Jobs › Today: what I have done today, then one pick to go on with and
 * what is ready for its form. Every other pick, and how they were picked,
 * sit behind a tap. Today counts what is done, never what is left, and its
 * words are `lib/jobs/words`.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import { dayOf } from "@some-ui/core-utils"
import type { Digest, Pick } from "@some-ui/job-desk"
import {
  digestFindings,
  freeSlots,
  MAX_NOTE,
  MAX_OPEN_PICKS,
  PICKS_PER_DAY,
  TRACKS,
} from "@some-ui/job-desk"
import { Badge, Button, Textarea } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import { useMinuteClock } from "@/lib/clock"
import { phoneJobs } from "@/lib/jobs"
import type { JobsState } from "@/lib/jobs/model"
import {
  currentDigest,
  decisionOf,
  disagreed,
  kitOf,
  openOf,
  pacificDay,
  picksStanding,
  progressOf,
  standingOf,
} from "@/lib/jobs/model"
import { doneOn, nextPick } from "@/lib/jobs/today"
import {
  allDone,
  answersDrafted,
  arriveOnTheirOwn,
  breaksRules,
  coverLetterDrafted,
  detailsToPaste,
  doneToday,
  fitWord,
  heldOver,
  holdsPlace,
  howPicked,
  keepWhy,
  lapsedBeforeHeard,
  lapsedEarlier,
  lapsedList,
  leftOut,
  newerHeld,
  noPicksYet,
  notToday,
  openIt,
  openOfTrack,
  orOpenFile,
  pickedForYou,
  pickedFrom,
  pickState,
  readIt,
  readyHeading,
  resumeInHand,
  resumeToBuild,
  saidWouldHavePicked,
  seeAll,
  sendIt,
  stillOpen,
  trackHeading,
  whatMorningsBring,
  whyItFits,
  wouldHavePicked,
} from "@/lib/jobs/words"
import { postingLine, sectionHeading } from "@/components/job-reading"

import { OpenDigest, Problem, useJobs } from "./parts"

/** A pick's place in Jobs: a link on the phone, plain elsewhere. */
const ToPick = ({
  day,
  pick,
  className,
  children,
}: {
  day: string
  pick: Pick
  className: string
  children: ReactNode
}): JSX.Element =>
  hasAudience("apk") ? (
    <Link
      to="/jobs/pick/$day/$pickId"
      params={{ day, pickId: pick.id }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )

/**
 * What is ready for the company's form, only what truly is: the résumé once
 * I said I have its PDF, and what the pick's kit holds. The résumé still to
 * build is said apart, unticked.
 */
function readiness(
  state: JobsState,
  day: string,
  pick: Pick
): { ready: Array<string>; resume: string | null } {
  const { kit } = kitOf(state, day, pick)
  const answers =
    kit.answers.length + kit.questions.filter((q) => q.draft !== null).length
  const variant =
    pick.resume.kind === "build" ? pick.resume.variant : pick.resume.fallback
  const progress = progressOf(state, day, pick.id)
  const inHand = progress.kind === "open" && progress.step >= 3
  return {
    ready: [
      ...(inHand ? [resumeInHand(variant)] : []),
      ...(kit.coverLetter === null ? [] : [coverLetterDrafted]),
      ...(answers === 0 ? [] : [answersDrafted(answers)]),
      ...(kit.fields.length === 0 ? [] : [detailsToPaste(kit.fields.length)]),
    ],
    resume: inHand ? null : resumeToBuild(variant),
  }
}

/** The one pick Today opens on, and what is ready for its form. */
const NextPick = ({
  state,
  day,
  pick,
}: {
  state: JobsState
  day: string
  pick: Pick
}): JSX.Element => {
  const { ready, resume } = readiness(state, day, pick)
  const untouched = decisionOf(state, day, pick.id) === null
  const pickRef = { day, pickId: pick.id, fingerprint: pick.fingerprint }
  const link = {
    to: "/jobs/pick/$day/$pickId",
    params: { day, pickId: pick.id },
  } as const
  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <span className="text-muted-foreground text-xs">
        {pickedForYou} · {fitWord(pick.scores.fit)}
      </span>
      <h2 className="text-xl leading-tight font-bold">{pick.posting.title}</h2>
      <span className="text-muted-foreground text-sm">
        {postingLine(pick.posting)}
      </span>
      <p className="bg-muted rounded-xl p-3 text-sm">{pick.scores.fitWhy}</p>
      {ready.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-xl border p-3">
          <h3 className={sectionHeading}>{readyHeading}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {ready.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check aria-hidden className="size-4 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
      {resume !== null && (
        <p className="text-muted-foreground text-sm">{resume}</p>
      )}
      {hasAudience("apk") &&
        (untouched ? (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild size="lg" variant="outline">
              <Link {...link}>{readIt}</Link>
            </Button>
            <Button asChild size="lg">
              <Link
                {...link}
                onClick={() => {
                  phoneJobs().record({ type: "taken", ...pickRef })
                }}
              >
                {sendIt}
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild size="lg">
            <Link {...link}>{openIt}</Link>
          </Button>
        ))}
    </section>
  )
}

const PickCard = ({
  state,
  day,
  pick,
}: {
  state: JobsState
  day: string
  pick: Pick
}): JSX.Element => {
  const today = pacificDay(useMinuteClock())
  const progress = standingOf(state, day, pick.id, today)
  return (
    <ToPick
      day={day}
      pick={pick}
      className="bg-card hover:border-primary flex flex-col gap-1 rounded-xl border p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="leading-tight font-semibold">
          {pick.posting.title}
        </span>
        <Badge
          variant={
            progress.kind === "open" && progress.step === 0
              ? "outline"
              : "secondary"
          }
        >
          {pickState(progress)}
        </Badge>
      </div>
      <span className="text-muted-foreground text-xs">
        {postingLine(pick.posting)} · {fitWord(pick.scores.fit)}
      </span>
    </ToPick>
  )
}

/** Every pick of the digest on show, by track, behind one tap. */
const AllPicks = ({
  state,
  digest,
}: {
  state: JobsState
  digest: Digest
}): JSX.Element => {
  const [shown, setShown] = useState(false)
  return (
    <section className="flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={shown}
        onClick={() => setShown((s) => !s)}
      >
        {seeAll(shown)}
      </Button>
      {shown &&
        TRACKS.map((track) => {
          const picks = digest.picks.filter((p) => p.track === track)
          if (picks.length === 0) return null
          return (
            <section key={track} className="flex flex-col gap-2">
              <h2 className={sectionHeading}>{trackHeading[track]}</h2>
              {picks.map((pick) => (
                <PickCard
                  key={pick.id}
                  state={state}
                  day={digest.day}
                  pick={pick}
                />
              ))}
            </section>
          )
        })}
    </section>
  )
}

/**
 * The places open picks hold: how many are open by track, earlier days'
 * picks still open, what the morning's picking found had lapsed, and
 * earlier days' lapsed picks, still there to open and decide.
 */
const Places = ({
  state,
  digest,
}: {
  state: JobsState
  digest: Digest
}): JSX.Element => {
  const today = pacificDay(useMinuteClock())
  const [showLapsed, setShowLapsed] = useState(false)
  const open = openOf(state, today)
  const recorded = digest.queue?.lapsed ?? []
  // A pick passed or debriefed here frees its place either way; one taken
  // and not ended takes its place back once the share arrives.
  const takenHere = recorded.filter((l) => {
    const progress = progressOf(state, l.day, l.pickId)
    return progress.kind === "open" && progress.step > 0
  }).length
  const untouched = recorded.filter(
    (l) => decisionOf(state, l.day, l.pickId) === null
  ).length
  const lapsed = picksStanding(state, today, "lapsed").filter(
    (l) => l.day !== digest.day
  )
  const earlier = [
    ...new Set(open.filter((o) => o.day !== digest.day).map((o) => o.day)),
  ]
  const queued = digest.queue?.open ?? []
  const held = queued.filter((p) => !p.closed)
  const room = freeSlots(queued)
  const full = digest.queue !== null && TRACKS.every((t) => room[t] === 0)
  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm">
        {stillOpen(
          TRACKS.map((t) =>
            openOfTrack(
              t,
              open.filter((o) => o.pick.track === t).length,
              MAX_OPEN_PICKS[t]
            )
          )
        )}
      </p>
      <p className="text-muted-foreground text-xs">
        {holdsPlace}
        {held.length > 0 && ` ${heldOver(held.length, full)}`}
        {untouched > 0 && ` ${lapsedEarlier(untouched)}`}
        {takenHere > 0 && ` ${lapsedBeforeHeard(takenHere)}`}
      </p>
      {earlier.map((day) => (
        <div key={day} className="flex flex-col gap-1.5 border-t pt-2">
          <span className="text-xs font-semibold">{day}</span>
          <ul className="flex flex-col gap-1">
            {open
              .filter((o) => o.day === day)
              .map(({ pick }) => (
                <li key={pick.id}>
                  <ToPick
                    day={day}
                    pick={pick}
                    className="text-sm underline-offset-2 hover:underline"
                  >
                    {pick.posting.title} · {pick.posting.company} ·{" "}
                    {pickState(progressOf(state, day, pick.id))}
                  </ToPick>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {lapsed.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={showLapsed}
            onClick={() => setShowLapsed((shown) => !shown)}
          >
            {lapsedList(showLapsed, lapsed.length)}
          </Button>
          {showLapsed && (
            <ul className="flex flex-col gap-1">
              {lapsed.map(({ day, pick }) => (
                <li key={`${day}/${pick.id}`}>
                  <ToPick
                    day={day}
                    pick={pick}
                    className="text-sm underline-offset-2 hover:underline"
                  >
                    {day} · {pick.posting.title} · {pick.posting.company}
                  </ToPick>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

const LeftOut = ({
  state,
  day,
  aside,
}: {
  state: JobsState
  day: string
  aside: Digest["setAside"][number]
}): JSX.Element => {
  const [note, setNote] = useState<string | null>(null)
  const said = disagreed(state).has(aside.fingerprint)
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border p-3">
      <span className="text-sm font-semibold">{aside.title}</span>
      <span className="text-muted-foreground text-xs">
        {aside.company} · {aside.why}
      </span>
      {said ? (
        <span className="text-xs">{saidWouldHavePicked}</span>
      ) : note === null ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setNote("")}
        >
          {wouldHavePicked}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={`Why ${aside.title}`}
            rows={2}
            maxLength={MAX_NOTE}
            value={note}
            placeholder={whyItFits}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={note.trim() === ""}
            onClick={() =>
              phoneJobs().record({
                type: "disagree",
                day,
                fingerprint: aside.fingerprint,
                note: note.trim(),
              })
            }
          >
            {keepWhy}
          </Button>
        </div>
      )}
    </li>
  )
}

/** How the picks on show came to be, behind one disclosure. */
const HowPicked = ({
  state,
  digest,
  picker,
}: {
  state: JobsState
  digest: Digest
  /** The file picker, when it isn't already offered above. */
  picker: boolean
}): JSX.Element => {
  const [showLeftOut, setShowLeftOut] = useState(false)
  const findings = digestFindings(digest)
  return (
    <details className="rounded-xl border p-3">
      <summary className="text-muted-foreground cursor-pointer text-sm font-semibold">
        {howPicked}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm">
          {pickedFrom(
            digest.day,
            digest.seen,
            digest.picks.length,
            digest.setAside.length
          )}
        </p>
        {findings.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {breaksRules(findings.length, findings[0]?.message ?? "")}
          </p>
        )}
        <Places state={state} digest={digest} />
        {digest.setAside.length > 0 && (
          <section className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={showLeftOut}
              onClick={() => setShowLeftOut((s) => !s)}
            >
              {leftOut(showLeftOut, digest.setAside.length)}
            </Button>
            {showLeftOut && (
              <ul className="flex flex-col gap-2">
                {digest.setAside.map((aside) => (
                  <LeftOut
                    key={aside.fingerprint}
                    state={state}
                    day={digest.day}
                    aside={aside}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
        {picker && <OpenDigest />}
      </div>
    </details>
  )
}

export const JobsToday = (): JSX.Element => {
  const { state } = useJobs()
  const now = useMinuteClock()
  const digest = currentDigest(state)

  if (digest === null) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <h2 className="text-xl font-bold">{noPicksYet}</h2>
        <p className="text-muted-foreground">
          {whatMorningsBring(PICKS_PER_DAY.software, PICKS_PER_DAY.adjacent)}
        </p>
        <p className="text-sm">{arriveOnTheirOwn}</p>
        <OpenDigest label={orOpenFile} />
        <Problem />
      </section>
    )
  }

  const earlier = digest.day < pacificDay(now)
  // Opening an older file shows it even when a newer digest is held.
  const newer = state.digests.some((d) => d.day > digest.day)
  const next = nextPick(state, pacificDay(now))
  const done = doneOn(state, dayOf(now), dayOf)
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-semibold empty:hidden">
        {done > 0 ? doneToday(done) : null}
      </p>
      {earlier && (
        <section className="flex flex-col gap-2">
          <p className="text-sm">
            {newer
              ? newerHeld(digest.day)
              : `${notToday(digest.day)} ${arriveOnTheirOwn}`}
          </p>
          <OpenDigest label={orOpenFile} />
        </section>
      )}
      <Problem />
      {next === null ? (
        <p className="bg-muted rounded-xl p-4 text-sm">{allDone}</p>
      ) : (
        <NextPick state={state} day={next.day} pick={next.pick} />
      )}
      <AllPicks state={state} digest={digest} />
      <HowPicked state={state} digest={digest} picker={!earlier} />
    </div>
  )
}

/**
 * Jobs › Today: the digest opened last, the queue its picks wait in, its
 * picks by track, and what the routine set aside.
 */
import type { JSX } from "react"
import { useState } from "react"
import { assertNever, counted } from "@some-ui/core-utils"
import type { Digest, Pick, Track } from "@some-ui/job-desk"
import {
  digestFindings,
  freeSlots,
  MAX_NOTE,
  MAX_OPEN_PICKS,
  PICKS_PER_DAY,
  TRACKS,
} from "@some-ui/job-desk"
import { Badge, Button, Textarea, useConfirmSheet } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { phoneJobs } from "@/lib/jobs"
import type { JobsState, Progress } from "@/lib/jobs/model"
import {
  currentDigest,
  disagreed,
  openOf,
  pacificDay,
  progressOf,
  undecidedOf,
} from "@/lib/jobs/model"
import {
  arriveOnTheirOwn,
  newerHeld,
  notToday,
  orOpenFile,
} from "@/lib/jobs/words"
import { Meter, resumeLabel, sectionHeading } from "@/components/job-reading"

import { OpenDigest, Problem, useJobs } from "./parts"

const TRACK_HEADINGS: Readonly<Record<Track, string>> = {
  software: "Software engineering",
  adjacent: "Software-adjacent",
}

const STATE_LABEL = (progress: Progress): string => {
  switch (progress.kind) {
    case "passed": {
      return "Passed"
    }
    case "archived": {
      return "Archived"
    }
    case "done": {
      return progress.result === "submitted" ? "Applied" : "Done"
    }
    case "open": {
      return progress.step === 0 ? "New" : "In progress"
    }
    default: {
      return assertNever(progress)
    }
  }
}

const Steps = ({ progress }: { progress: Progress }): JSX.Element => {
  const done = progress.kind === "open" ? progress.step : 5
  return (
    <div className="flex gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`h-1 min-w-0 flex-1 rounded-full ${i < done ? "bg-emerald-600" : "bg-muted"}`}
        />
      ))}
    </div>
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
  const progress = progressOf(state, day, pick.id)
  const { posting } = pick
  const card =
    "bg-card hover:border-primary flex flex-col gap-2 rounded-xl border p-3"
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="leading-tight font-semibold">{posting.title}</span>
        <Badge
          variant={
            progress.kind === "open" && progress.step === 0
              ? "outline"
              : "secondary"
          }
        >
          {STATE_LABEL(progress)}
        </Badge>
      </div>
      <span className="text-muted-foreground text-xs">
        {[
          posting.company,
          posting.location,
          posting.compensation,
          posting.postedOn,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <Meter label="Fit" value={pick.scores.fit} tone="fit" />
      <Meter label="Odds" value={pick.scores.odds} tone="odds" />
      <span className="text-xs">{resumeLabel(pick.resume)}</span>
      <Steps progress={progress} />
    </>
  )
  return hasAudience("apk") ? (
    <Link
      to="/jobs/pick/$day/$pickId"
      params={{ day, pickId: pick.id }}
      className={card}
    >
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  )
}

/** Archives `day`'s undecided picks unreviewed, once asked. */
const ArchiveBatch = ({
  day,
  count,
  label,
}: {
  day: string
  count: number
  label: string
}): JSX.Element => {
  const jobs = phoneJobs()
  const { ask, sheet } = useConfirmSheet()
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() =>
          ask({
            title: `Archive ${counted(count, "pick")}?`,
            description:
              "They leave the queue unreviewed, which the morning run hears once you share your decisions. You can still open one and decide it.",
            confirm: "Archive them",
            keep: "Review them",
            onConfirm: () => {
              jobs.archive(day)
            },
          })
        }
      >
        {label}
      </Button>
      {sheet}
    </>
  )
}

/**
 * How many picks each track holds open, and the first choice on a digest:
 * review its picks, or archive the undecided ones unreviewed. Earlier
 * digests' open picks are listed here, since the cards below are only this
 * digest's.
 */
const Queue = ({
  state,
  digest,
}: {
  state: JobsState
  digest: Digest
}): JSX.Element => {
  const open = openOf(state)
  const undecided = undecidedOf(state, digest.day)
  const earlier = [
    ...new Set(open.filter((o) => o.day !== digest.day).map((o) => o.day)),
  ]
  const held = digest.queue?.open ?? []
  const room = freeSlots(held)
  const full = digest.queue !== null && TRACKS.every((t) => room[t] === 0)
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-3">
      <h2 className={sectionHeading}>Queue</h2>
      <p className="text-sm tabular-nums">
        Open on this phone:{" "}
        {TRACKS.map(
          (t) =>
            `${open.filter((o) => o.pick.track === t).length} of ${MAX_OPEN_PICKS[t]} ${t}`
        ).join(" · ")}
      </p>
      <p className="text-muted-foreground text-xs">
        A pick stays open until you pass it, archive it, or take it and debrief,
        and share your decisions. The morning run adds new picks only into free
        slots.
        {held.length > 0 &&
          ` This one found ${counted(held.filter((p) => !p.closed).length, "pick")} from earlier days still open${full ? ", so it searched nothing" : ""}.`}
      </p>
      {undecided.length > 0 && (
        <ArchiveBatch
          day={digest.day}
          count={undecided.length}
          label={`Archive ${counted(undecided.length, "undecided pick")}`}
        />
      )}
      {earlier.map((day) => {
        const left = undecidedOf(state, day).length
        return (
          <div key={day} className="flex flex-col gap-1.5 border-t pt-2">
            <span className="text-xs font-semibold">{day}</span>
            <ul className="flex flex-col gap-1">
              {open
                .filter((o) => o.day === day)
                .map(({ pick }) => (
                  <li key={pick.id}>
                    <Link
                      to="/jobs/pick/$day/$pickId"
                      params={{ day, pickId: pick.id }}
                      className="text-sm underline-offset-2 hover:underline"
                    >
                      {pick.posting.title} · {pick.posting.company} ·{" "}
                      {STATE_LABEL(progressOf(state, day, pick.id))}
                    </Link>
                  </li>
                ))}
            </ul>
            {left > 0 && (
              <ArchiveBatch
                day={day}
                count={left}
                label={`Archive ${day}’s ${counted(left, "undecided pick")}`}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}

const SetAside = ({
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
        <span className="text-xs">
          You’d have picked this. Tomorrow’s run hears it.
        </span>
      ) : note === null ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setNote("")}
        >
          I’d have picked this
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={`Why ${aside.title}`}
            rows={2}
            maxLength={MAX_NOTE}
            value={note}
            placeholder="Why it fits"
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
            Tell the run
          </Button>
        </div>
      )}
    </li>
  )
}

export const JobsToday = (): JSX.Element => {
  const { state } = useJobs()
  const [showAside, setShowAside] = useState(false)
  const digest = currentDigest(state)

  if (digest === null) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <h2 className="text-xl font-bold">No picks open yet</h2>
        <p className="text-muted-foreground">
          Every morning a run leaves the day’s picks in Drive: up to{" "}
          {counted(PICKS_PER_DAY.software, "software role")} and{" "}
          {counted(PICKS_PER_DAY.adjacent, "software-adjacent one")}, each
          scored against the résumé. Open the newest one here.
        </p>
        <p className="text-sm">{arriveOnTheirOwn}</p>
        <OpenDigest label={orOpenFile} />
        <Problem />
      </section>
    )
  }

  const today = pacificDay(new Date())
  const earlier = digest.day < today
  // Opening an older file shows it even when a newer digest is held.
  const newer = state.digests.some((d) => d.day > digest.day)
  const findings = digestFindings(digest)
  const tracks = TRACKS.map((t) => [t, TRACK_HEADINGS[t]] as const)
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">{digest.day}</span>
          <Badge>{digest.picks.length} picks</Badge>
        </div>
        <span className="text-muted-foreground text-xs">
          {digest.seen} seen, {digest.setAside.length} set aside, checked at
          some-ui {digest.evidence.someUi}.
        </span>
        {findings.length > 0 && (
          <p
            role="status"
            className="text-amber-700 text-xs dark:text-amber-400"
          >
            This digest breaks {findings.length} of the run’s rules (first:{" "}
            {findings[0]?.message}). Its picks still open.
          </p>
        )}
        {earlier && (
          <p className="text-sm">
            {newer
              ? newerHeld(digest.day)
              : `${notToday(digest.day)} ${arriveOnTheirOwn}`}
          </p>
        )}
        <OpenDigest label={earlier ? orOpenFile : undefined} />
      </section>
      <Problem />
      <Queue state={state} digest={digest} />
      {tracks.map(([track, heading]) => {
        const picks = digest.picks.filter((p) => p.track === track)
        if (picks.length === 0) return null
        return (
          <section key={track} className="flex flex-col gap-2">
            <h2 className={sectionHeading}>
              {heading} · {picks.length}
            </h2>
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
      {digest.setAside.length > 0 && (
        <section className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setShowAside((s) => !s)}
          >
            {showAside ? "Hide" : "Show"} what the run set aside (
            {digest.setAside.length})
          </Button>
          {showAside && (
            <ul className="flex flex-col gap-2">
              {digest.setAside.map((aside) => (
                <SetAside
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
    </div>
  )
}

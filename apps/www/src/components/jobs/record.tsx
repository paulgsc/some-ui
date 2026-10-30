/**
 * Jobs › Record: every pick taken, what came of it, and today's decisions
 * on their way to the morning run, the card wearing where they are. Each
 * application's card wears its course (`courseOf`): one waiting to hear
 * stands out and offers only the outcomes still ahead of it; one that ended
 * or was never sent fades and offers nothing, unless I say I heard
 * something since.
 */
import type { JSX } from "react"
import { useState } from "react"
import { cn, dayOf, median } from "@some-ui/core-utils"
import { Badge, Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { useMinuteClock } from "@/lib/clock"
import { phoneJobs } from "@/lib/jobs"
import { kindJourney } from "@/lib/jobs/journey"
import type { Application, Course } from "@/lib/jobs/model"
import { applicationsOf, courseOf, lastDelivered } from "@/lib/jobs/model"
import {
  courseBadge,
  courseSays,
  FILE_NAMES,
  heardSince,
  outcomeLabels,
} from "@/lib/jobs/words"
import { sectionHeading } from "@/components/job-reading"

import {
  JourneyCard,
  Problem,
  ShareAction,
  useJobs,
  useJourneyContext,
} from "./parts"

export const JobsRecord = (): JSX.Element => {
  const { state } = useJobs()
  const applications = applicationsOf(state)
  const debriefs = state.log.flatMap((e) => (e.type === "debrief" ? [e] : []))
  const passed = state.log.filter((e) => e.type === "passed").length
  const minutes = median(
    debriefs.flatMap((d) => (d.minutes === null ? [] : [d.minutes]))
  )
  const last = lastDelivered(state, "decisions")
  const journey = kindJourney(useJourneyContext(), "decisions")
  const today = dayOf(useMinuteClock())
  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm tabular-nums">
        <span className="text-muted-foreground">Taken · passed</span>
        <span className="text-right">
          {applications.length} · {passed}
        </span>
        <span className="text-muted-foreground">Applied</span>
        <span className="text-right">
          {debriefs.filter((d) => d.result === "submitted").length}
        </span>
        <span className="text-muted-foreground">Median minutes</span>
        <span className="text-right">
          {minutes === null ? "–" : Math.round(minutes)}
        </span>
      </section>
      <p className="text-muted-foreground text-xs">
        Nothing here is edited or deleted, only added to.
      </p>
      <JourneyCard title={FILE_NAMES.decisions} journey={journey} noun="them">
        <p className="text-muted-foreground px-3.5 py-3 text-xs">
          The morning run reads these and your voice notes.
          {last ? ` Last sent ${last.day}.` : ""}
        </p>
        <ShareAction
          kind="decisions"
          journey={journey}
          label="Share today’s decisions"
        />
      </JourneyCard>
      <Problem />
      {applications.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeading}>Applications</h2>
          <ul className="flex flex-col gap-2">
            {applications.map((a) => (
              <ApplicationCard
                key={`${a.day}/${a.pick.id}`}
                application={a}
                course={courseOf(state, a, today, dayOf)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const ApplicationCard = ({
  application: a,
  course,
}: {
  application: Application
  course: Course
}): JSX.Element => {
  const jobs = phoneJobs()
  const [reopened, setReopened] = useState(false)
  const settled = course.kind === "ended" || course.kind === "unsent"
  const offered =
    course.kind === "waiting" || (course.kind === "ended" && reopened)
      ? course.next
      : []
  const says = courseSays(course)
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        course.kind === "waiting" && "border-primary/50 bg-card",
        settled && "bg-muted/60 border-dashed"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {hasAudience("apk") ? (
          <Link
            to="/jobs/pick/$day/$pickId"
            params={{ day: a.day, pickId: a.pick.id }}
            className={cn(
              "text-sm font-semibold underline-offset-2 hover:underline",
              settled && "text-muted-foreground"
            )}
          >
            {a.pick.posting.title}
          </Link>
        ) : (
          <span
            className={cn(
              "text-sm font-semibold",
              settled && "text-muted-foreground"
            )}
          >
            {a.pick.posting.title}
          </span>
        )}
        <Badge
          variant={
            course.kind === "waiting" ||
            (course.kind === "ended" && course.by === "offer")
              ? "default"
              : settled
                ? "outline"
                : "secondary"
          }
        >
          {courseBadge(course)}
        </Badge>
      </div>
      <span className="text-muted-foreground text-xs">
        {a.pick.posting.company} · {a.day}
      </span>
      {a.outcomes.length > 0 && (
        <span className={cn("text-xs", settled && "text-muted-foreground")}>
          {a.outcomes
            .map((o) => `${outcomeLabels[o.event]} ${o.on}`)
            .join(" · ")}
        </span>
      )}
      {says && <p className="text-muted-foreground text-xs">{says}</p>}
      {offered.length > 0 && (
        <div
          role="group"
          aria-label="What happened since"
          className="flex flex-wrap gap-1.5"
        >
          {offered.map((event) => (
            <Button
              key={event}
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (jobs.addOutcome(a.pick.fingerprint, event))
                  setReopened(false)
              }}
            >
              {outcomeLabels[event]}
            </Button>
          ))}
        </div>
      )}
      {course.kind === "ended" && course.next.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="text-muted-foreground self-start px-0"
          aria-expanded={reopened}
          onClick={() => setReopened((open) => !open)}
        >
          {heardSince(reopened)}
        </Button>
      )}
    </li>
  )
}

/**
 * Jobs › Record: every pick taken, what came of it, and today's decisions
 * out to Drive for the morning run.
 */
import type { JSX } from "react"
import { median } from "@some-ui/core-utils"
import { OUTCOMES } from "@some-ui/job-desk"
import { Badge, Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { phoneJobs } from "@/lib/jobs"
import type { Outcome } from "@/lib/jobs/model"
import { applicationsOf, lastDelivered } from "@/lib/jobs/model"
import { sectionHeading } from "@/components/job-reading"

import { Problem, ShareToDrive, useJobs } from "./parts"

const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  viewed: "Viewed",
  reply: "Reply",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  "no-reply-30d": "No reply in 30 days",
}

export const JobsRecord = (): JSX.Element => {
  const { state } = useJobs()
  const jobs = phoneJobs()
  const applications = applicationsOf(state)
  const debriefs = state.log.flatMap((e) => (e.type === "debrief" ? [e] : []))
  const passed = state.log.filter((e) => e.type === "passed").length
  const minutes = median(debriefs.map((d) => d.minutes))
  const last = lastDelivered(state, "decisions")
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
      <ShareToDrive kind="decisions" label="Share today’s decisions">
        <p className="text-muted-foreground text-xs">
          The morning run reads these and your voice notes.
          {last ? ` Last shared ${last.day}.` : ""}
        </p>
      </ShareToDrive>
      <Problem />
      {applications.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeading}>Applications</h2>
          <ul className="flex flex-col gap-2">
            {applications.map((a) => (
              <li
                key={`${a.day}/${a.pick.id}`}
                className="flex flex-col gap-2 rounded-xl border p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  {hasAudience("apk") ? (
                    <Link
                      to="/jobs/pick/$day/$pickId"
                      params={{ day: a.day, pickId: a.pick.id }}
                      className="text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {a.pick.posting.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold">
                      {a.pick.posting.title}
                    </span>
                  )}
                  <Badge variant="secondary">
                    {a.progress.kind === "done"
                      ? a.progress.result
                      : "in progress"}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">
                  {a.pick.posting.company} · {a.day}
                </span>
                {a.outcomes.length > 0 && (
                  <span className="text-xs">
                    {a.outcomes
                      .map((o) => `${OUTCOME_LABELS[o.event]} ${o.on}`)
                      .join(" · ")}
                  </span>
                )}
                {a.progress.kind === "done" && (
                  <div
                    role="group"
                    aria-label="What happened since"
                    className="flex flex-wrap gap-1.5"
                  >
                    {OUTCOMES.map((event) => (
                      <Button
                        key={event}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          jobs.addOutcome(a.pick.fingerprint, event)
                        }
                      >
                        {OUTCOME_LABELS[event]}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

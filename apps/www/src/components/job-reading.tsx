/**
 * How a jobs digest reads, wherever it is read: the run's scores and the
 * gaps it found. The phone's Jobs wing (`components/jobs`) and the web's
 * reading of a sample morning (`components/job-run`) both show them.
 */
import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { Pick, ResumeRecommendation } from "@some-ui/job-desk"
import { Badge } from "@some-ui/shared"

export const sectionHeading =
  "text-muted-foreground text-xs font-semibold tracking-wider uppercase"

/** A 0–1 score as a bar and its value. */
export const Meter = ({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "fit" | "odds"
}): JSX.Element => (
  <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-xs tabular-nums">
    <span>{label}</span>
    <span className="bg-muted h-1.5 overflow-hidden rounded-full">
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "fit" ? "bg-emerald-600" : "bg-amber-500"
        )}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
    <span className="text-right">{value.toFixed(2)}</span>
  </div>
)

/** The run's two scores, each with the reasons it gave. */
export const Scores = ({ scores }: { scores: Pick["scores"] }): JSX.Element => (
  <section className="flex flex-col gap-1.5 rounded-xl border p-3">
    <Meter label="Fit" value={scores.fit} tone="fit" />
    <span className="text-muted-foreground text-xs">{scores.fitWhy}</span>
    <Meter label="Odds" value={scores.odds} tone="odds" />
    <span className="text-muted-foreground text-xs">{scores.oddsWhy}</span>
  </section>
)

/** What the posting asks for that my evidence doesn't cover. */
export const Gaps = ({ gaps }: { gaps: Pick["gaps"] }): JSX.Element | null =>
  gaps.length === 0 ? null : (
    <section className="flex flex-col gap-2">
      <h3 className={sectionHeading}>Gaps</h3>
      <ul className="flex flex-col gap-1.5">
        {gaps.map((gap) => (
          <li key={gap.text} className="flex items-baseline gap-2 text-sm">
            <Badge variant="outline" className="w-20 shrink-0 justify-center">
              {gap.kind}
            </Badge>
            {gap.text}
          </li>
        ))}
      </ul>
    </section>
  )

/** The résumé a pick sends, in one line. */
export function resumeLabel(resume: ResumeRecommendation): string {
  return resume.kind === "build"
    ? `Build · ${resume.variant} · ${resume.template}`
    : `Patch · ${resume.variant}${resume.pr === null ? " (proposed)" : ` · PR #${resume.pr}`}`
}

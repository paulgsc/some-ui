import type { FC } from "react"
import {
  CURRICULUM_STAGES,
  STAGE_META,
  stageOrder,
} from "@leetype/lib/leetype/curriculum"
import type { ChallengeCurriculum } from "@leetype/types/leetype"
import { Check, Flag, Lightbulb, Link2, Sparkles, Target } from "lucide-react"
import { Badge } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ChallengeBriefProps = {
  /** The dense problem's own statement, or the exercise's if it stands alone. */
  description: string
  tags: Array<string>
  /**
   * Present when this challenge is one node of a decomposed curriculum.
   * Absent for the flat demo pool, which falls back to description + tags —
   * the shape this panel had before curricula existed.
   */
  curriculum?: ChallengeCurriculum
}

/** The rungs actually worth drawing: the ladder minus nothing, in order. */
const LADDER = CURRICULUM_STAGES

type SectionProps = {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

const Section: FC<SectionProps> = ({ icon, title, children }) => (
  <section className="space-y-2">
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      {title}
    </h3>
    {children}
  </section>
)

const ConceptList: FC<{ items: Array<string>; tone: "new" | "again" }> = ({
  items,
  tone,
}) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <Badge
        key={item}
        variant="outline"
        className={cn(
          "font-mono text-xs",
          tone === "new"
            ? "border-primary/40 bg-primary/10 text-primary"
            : "text-muted-foreground"
        )}
      >
        {item}
      </Badge>
    ))}
  </div>
)

/**
 * The ladder itself, as a row of rungs with the current one lit. This is the
 * one piece of the panel that has to work at a glance: the player should be
 * able to tell "I am four rungs up a six-rung ladder, and the rungs have
 * names" without reading a word of prose.
 */
const StageLadder: FC<{ stage: ChallengeCurriculum["stage"] }> = ({
  stage,
}) => {
  const current = stageOrder(stage)

  return (
    <ol className="flex items-stretch gap-1" aria-label="Curriculum stage">
      {LADDER.map((rung, index) => {
        const isDone = index < current
        const isCurrent = index === current
        return (
          <li key={rung} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1 rounded-full",
                isCurrent
                  ? "bg-primary"
                  : isDone
                    ? "bg-primary/40"
                    : "bg-border"
              )}
            />
            <span
              className={cn(
                "truncate text-[10px] leading-tight",
                isCurrent
                  ? "font-semibold text-primary"
                  : "text-muted-foreground/60"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {STAGE_META[rung].label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * What the player sees when they ask "what is this and why am I typing it?"
 *
 * A curriculum challenge is not a problem statement — it's one node of a
 * decomposition, and its whole justification is positional: *the next exercise
 * literally requires this one*. So the answer this panel leads with is the
 * ladder and the insight, not the prose. The dense problem the ladder
 * culminates in is shown last, as the destination rather than the task.
 *
 * With no curriculum attached it degrades to exactly what it used to be: the
 * description, then the tags.
 */
export const ChallengeBrief: FC<ChallengeBriefProps> = ({
  description,
  tags,
  curriculum,
}) => {
  if (!curriculum) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-mono text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    )
  }

  const meta = STAGE_META[curriculum.stage]

  return (
    <div className="space-y-5">
      {/* Position, first and largest: step N of M on a named rung. */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={curriculum.stage === "master" ? "destructive" : "default"}
            className="text-xs"
          >
            {meta.label}
          </Badge>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            Exercise {curriculum.step} of {curriculum.totalSteps}
          </span>
        </div>
        <StageLadder stage={curriculum.stage} />
        <p className="text-xs italic text-muted-foreground/80">{meta.blurb}</p>
      </div>

      {/* The single sentence that justifies this exercise existing at all. */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Lightbulb className="h-3.5 w-3.5" />
          Why this one
        </h3>
        <p className="text-sm leading-relaxed text-card-foreground">
          {curriculum.insight}
        </p>
      </div>

      <Section icon={<Target className="h-3.5 w-3.5" />} title="This exercise">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </Section>

      {curriculum.learningObjectives.length > 0 && (
        <Section
          icon={<Flag className="h-3.5 w-3.5" />}
          title="You should come out able to"
        >
          <ul className="space-y-1.5">
            {curriculum.learningObjectives.map((objective) => (
              <li
                key={objective}
                className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {objective}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(curriculum.conceptsIntroduced.length > 0 ||
        curriculum.conceptsReinforced.length > 0) && (
        <Section
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Concepts in play"
        >
          <div className="space-y-2">
            {curriculum.conceptsIntroduced.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground/70">
                  New here
                </span>
                <ConceptList items={curriculum.conceptsIntroduced} tone="new" />
              </div>
            )}
            {curriculum.conceptsReinforced.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground/70">
                  Carried forward
                </span>
                <ConceptList
                  items={curriculum.conceptsReinforced}
                  tone="again"
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {curriculum.completionCriteria.length > 0 && (
        <Section icon={<Check className="h-3.5 w-3.5" />} title="Done when">
          <ul className="space-y-1.5">
            {curriculum.completionCriteria.map((criterion) => (
              <li
                key={criterion}
                className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                {criterion}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {curriculum.dependsOn.length > 0 && (
        <Section icon={<Link2 className="h-3.5 w-3.5" />} title="Builds on">
          <div className="flex flex-wrap gap-1.5">
            {curriculum.dependsOn.map((id) => (
              <Badge key={id} variant="secondary" className="font-mono text-xs">
                {id}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* The destination, stated last so it reads as "where this is going"
          rather than as today's task. */}
      <div className="rounded-lg border border-border bg-muted/30 p-3.5">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {curriculum.stage === "master"
            ? "You are here"
            : "All of this is for"}
        </h3>
        <p className="text-sm leading-relaxed text-card-foreground">
          {curriculum.targetProblem}
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-mono text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

import type { JSX } from "react"
import type { Draft } from "@lesson-crm/lib/draft"
import { Badge } from "@some-ui/shared"
import { RELATION_TAG_PREFIX } from "@some-ui/topik"
import { Check } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * What a save would serve: the intake's verdict on the lesson, exactly as a
 * learner's pasted lesson gets it - the counts it recounted, the tags it
 * derived, and every finding, with the probes an error withholds.
 */
export const LessonPreview = ({
  draft,
}: {
  draft: Draft | null
}): JSX.Element | null => {
  if (draft === null) return null
  if (!draft.ok) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {draft.error}
      </p>
    )
  }
  const { meta, findings } = draft.intake
  const withheld = findings.filter((finding) => finding.severity === "error")
  const relations = (meta.tags ?? []).filter((tag) =>
    tag.startsWith(RELATION_TAG_PREFIX)
  )
  return (
    <section
      role="status"
      aria-label="Lesson check"
      className="flex flex-col gap-3 text-sm"
    >
      <p>
        <span className="font-semibold">{meta.batchCount} conversations</span>
        {" · "}
        {meta.totalMessages} lines · {meta.totalQuestions} questions
        {meta.difficulty ? ` · ${meta.difficulty}` : ""}
      </p>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">
          Derived relation tags (what selection reads)
        </span>
        <div className="flex flex-wrap gap-1">
          {relations.length === 0 ? (
            <span className="text-muted-foreground text-xs">
              None: no probe names a relation.
            </span>
          ) : (
            relations.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))
          )}
        </div>
      </div>
      {findings.length === 0 ? (
        <p className="text-success flex items-center gap-2">
          <Check className="size-4" /> Every probe will be asked as written.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            {withheld.length > 0
              ? `${withheld.length} probe${withheld.length === 1 ? " is" : "s are"} withheld: learners are served the lesson without ${withheld.length === 1 ? "it" : "them"}.`
              : "Warnings only: the lesson is served as written."}
          </p>
          <ul className="flex flex-col gap-1">
            {findings.map((finding, index) => (
              <li
                // Findings have no id; their order is the audit's own.
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs",
                  finding.severity === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {finding.severity === "error" ? "Withheld · " : "Warning · "}
                conversation {finding.batch ?? "?"}
                {finding.probe ? `, ${finding.probe}` : ""}: {finding.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

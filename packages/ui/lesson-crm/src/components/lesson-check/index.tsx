import type { JSX, ReactNode } from "react"
import type { Draft } from "@lesson-crm/lib/draft"
import { Badge, PageControls } from "@some-ui/shared"
import { RELATION_TAG_PREFIX } from "@some-ui/topik"
import { Check } from "lucide-react"
import { cn, useFittedPage } from "some-ui-utils"

type LessonCheckProps = {
  draft: Draft | null
  /** The save/retire row, where the layout puts it in the pane (a phone). */
  actions?: ReactNode
}

/**
 * What a save would serve: the intake's verdict on the lesson, exactly as a
 * learner's pasted lesson gets it - the counts it recounted, the tags it
 * derived, and every finding, with the probes an error withholds. Findings
 * are a list of any length, so they page to fit the pane.
 */
export const LessonCheck = ({
  draft,
  actions,
}: LessonCheckProps): JSX.Element => {
  const findings = draft?.ok ? draft.intake.findings : []
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(findings)

  const verdict = ((): JSX.Element => {
    if (draft === null) {
      return (
        <p className="text-muted-foreground text-sm">
          Nothing to check yet: paste a lesson first.
        </p>
      )
    }
    if (!draft.ok) {
      return (
        <p role="alert" className="text-destructive text-sm">
          {draft.error}
        </p>
      )
    }
    const { meta } = draft.intake
    const withheld = findings.filter((finding) => finding.severity === "error")
    const relations = (meta.tags ?? []).filter((tag) =>
      tag.startsWith(RELATION_TAG_PREFIX)
    )
    return (
      <div className="flex flex-col gap-3 text-sm">
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
          <p className="text-muted-foreground">
            {withheld.length > 0
              ? `${withheld.length} probe${withheld.length === 1 ? " is" : "s are"} withheld: learners are served the lesson without ${withheld.length === 1 ? "it" : "them"}.`
              : "Warnings only: the lesson is served as written."}
          </p>
        )}
      </div>
    )
  })()

  return (
    <section
      role="status"
      aria-label="Lesson check"
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <div className="shrink-0">{verdict}</div>
      <div ref={viewportRef} className="min-h-0 flex-1">
        <div ref={contentRef}>
          <ul className="flex flex-col gap-1">
            {pageItems.map((finding) => (
              <li
                key={`${finding.batch ?? "file"}:${finding.index ?? finding.probe ?? ""}:${finding.message}`}
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
      </div>
      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="findings"
      />
      {actions && <div className="shrink-0">{actions}</div>}
    </section>
  )
}

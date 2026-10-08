import type { JSX, ReactNode } from "react"
import { useMemo } from "react"
import type { Draft, TreeCheck } from "@lesson-crm/lib/draft"
import { cn } from "@some-ui/core-utils"
import { useFittedPage } from "@some-ui/react-hooks"
import { Badge, PageControls, Textarea } from "@some-ui/shared"
import type { ProbeFinding, TreeFinding } from "@some-ui/topik"
import {
  findingPlace,
  RELATION_TAG_PREFIX,
  treeFixRequest,
} from "@some-ui/topik"
import { Check } from "lucide-react"

type LessonCheckProps = {
  draft: Draft | null
  /** The save/retire row, where the layout puts it in the pane (a phone). */
  actions?: ReactNode
}

/** One finding as the list shows it, whichever intake made it. */
type Row = { key: string; error: boolean; text: string }

const probeRow = (finding: ProbeFinding): Row => ({
  key: `${finding.batch ?? "file"}:${finding.index ?? finding.probe ?? ""}:${finding.message}`,
  error: finding.severity === "error",
  text: `${finding.severity === "error" ? "Withheld" : "Warning"} · conversation ${finding.batch ?? "?"}${finding.probe ? `, ${finding.probe}` : ""}: ${finding.message}`,
})

const treeRow = (finding: TreeFinding): Row => ({
  key: `${finding.audit}:${finding.path}:${finding.message}`,
  error: finding.severity === "error",
  text: `${finding.severity === "error" ? "Error" : "Warning"} · ${finding.audit} · ${findingPlace(finding)}: ${finding.message}`,
})

const rowsOf = (draft: Draft | null): Array<Row> =>
  draft?.ok
    ? draft.intake.findings.map(probeRow)
    : (draft?.tree?.findings.map(treeRow) ?? [])

/**
 * A scene tree's verdict: whether it plays, and what the audits drop from it.
 * Nothing is saved; the findings go back to the model as one message.
 */
const TreeVerdict = ({ tree }: { tree: TreeCheck }): JSX.Element => {
  const errors = tree.findings.filter(({ severity }) => severity === "error")
  const fixes = tree.findings.length > 0 && (
    <details className="text-xs">
      <summary className="cursor-pointer">The fixes, to send the model</summary>
      <Textarea
        aria-label="Fixes for the model"
        readOnly
        rows={6}
        value={treeFixRequest(tree.findings)}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2 font-mono text-xs"
      />
    </details>
  )
  if (tree.status === "rejected") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p role="alert" className="text-destructive">
          This scene tree can&apos;t be played: {tree.findings.length} finding
          {tree.findings.length === 1 ? "" : "s"} below.
        </p>
        {fixes}
      </div>
    )
  }
  const characters = tree.lesson.cast.length
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <span className="font-semibold">A scene tree</span>
        {" · "}TOPIK {tree.lesson.level} · {characters} character
        {characters === 1 ? "" : "s"}
      </p>
      {tree.findings.length === 0 ? (
        <p className="text-success flex items-center gap-2">
          <Check className="size-4" /> Every choice will be asked as written.
        </p>
      ) : (
        <p className="text-muted-foreground">
          {errors.length > 0
            ? "A choice an error names is not asked: its scene ends there, and the scenes under it are dropped."
            : "Warnings only: the tree plays as written."}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Scene trees are checked here, not saved yet.
      </p>
      {fixes}
    </div>
  )
}

/**
 * What a save would serve: the intake's verdict on the lesson, exactly as a
 * learner's pasted lesson gets it - the counts it recounted, the tags it
 * derived, and every finding, with the probes an error withholds. A scene
 * tree gets both of its audits' findings, by path. Findings are a list of any
 * length, so they page to fit the pane.
 */
export const LessonCheck = ({
  draft,
  actions,
}: LessonCheckProps): JSX.Element => {
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(
    useMemo(() => rowsOf(draft), [draft]),
    { getItemKey: (row) => row.key }
  )

  const verdict = ((): JSX.Element => {
    if (draft === null) {
      return (
        <p className="text-muted-foreground text-sm">
          Nothing to check yet: paste a lesson first.
        </p>
      )
    }
    if (!draft.ok) {
      return draft.tree ? (
        <TreeVerdict tree={draft.tree} />
      ) : (
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
            {pageItems.map((row) => (
              <li
                key={row.key}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs",
                  row.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {row.text}
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

import type { JSX } from "react"
import { useState } from "react"
import type { OperatorLesson } from "@lesson-crm/lib/client"
import { cn } from "@some-ui/core-utils"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { useFittedPage } from "@some-ui/react-hooks"
import { Badge, Button, PageControls } from "@some-ui/shared"
import { Plus, RotateCcw } from "lucide-react"

type Shelf = "listed" | "retired"

type LessonListProps = {
  lessons: Array<OperatorLesson>
  /** The listing's own load, so a failure has a place to stay visible. */
  loading: Intent<unknown>
  selected: string | null
  onSelect: (key: string) => void
  onNew: () => void
  onReload: () => void
}

/**
 * Every lesson the server holds, one shelf at a time: the manifest - the
 * weekly batch learners choose from - or the retired ones, which the server
 * keeps because a learner may still be part-way through one.
 *
 * The list only grows (a batch a week, nothing deleted), so it is a measured
 * paged list (`useFittedPage`, `docs/ui-fit` rule 2), never a column that
 * pushes the page down.
 */
export const LessonList = ({
  lessons,
  loading,
  selected,
  onSelect,
  onNew,
  onReload,
}: LessonListProps): JSX.Element => {
  const [shelf, setShelf] = useState<Shelf>("listed")
  const listed = lessons.filter((lesson) => lesson.retiredAt === null)
  const retired = lessons.filter((lesson) => lesson.retiredAt !== null)
  const shown = shelf === "listed" ? listed : retired
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(shown, { getItemKey: (lesson) => lesson.key })

  const empty = matchIntent(loading, {
    idle: () => "Loading lessons…",
    working: () => "Loading lessons…",
    succeeded: () =>
      shelf === "listed"
        ? "Nothing in the manifest. Start a new lesson to serve one."
        : "Nothing retired.",
    failed: (error) => error.summary,
  })

  return (
    <nav aria-label="Lessons" className="flex h-full min-h-0 flex-col gap-2">
      <Button variant="outline" className="shrink-0 gap-2" onClick={onNew}>
        <Plus className="size-4" /> New lesson
      </Button>
      <div role="tablist" aria-label="Shelf" className="flex shrink-0 gap-1">
        {(
          [
            ["listed", "In the manifest", listed.length],
            ["retired", "Retired", retired.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={shelf === value}
            onClick={() => setShelf(value)}
            className={cn(
              "min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs",
              shelf === value
                ? "border-primary/40 bg-primary/15"
                : "border-border hover:bg-muted"
            )}
          >
            {label} · {count}
          </button>
        ))}
      </div>
      <div ref={viewportRef} className="min-h-0 flex-1">
        <div ref={contentRef}>
          <ul className="flex flex-col gap-1">
            {pageItems.map((lesson) => (
              <li key={lesson.key}>
                <button
                  type="button"
                  aria-current={selected === lesson.key ? "true" : undefined}
                  onClick={() => onSelect(lesson.key)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left",
                    selected === lesson.key ? "bg-accent" : "hover:bg-muted"
                  )}
                >
                  <span className="line-clamp-1 text-sm font-medium">
                    {lesson.displayName}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                    <span className="font-mono">{lesson.key}</span>
                    <Badge variant="outline">v{lesson.version}</Badge>
                    <span>{lesson.batchCount} conversations</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {shown.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-start gap-2 px-2 text-sm">
            <p role={loading.status === "failed" ? "alert" : undefined}>
              {empty}
            </p>
            {loading.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onReload}
              >
                <RotateCcw className="size-4" /> Try again
              </Button>
            )}
          </div>
        )}
      </div>
      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="lessons"
      />
    </nav>
  )
}

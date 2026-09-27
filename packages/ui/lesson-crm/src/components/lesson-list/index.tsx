import type { JSX } from "react"
import type { OperatorLesson } from "@lesson-crm/lib/client"
import { Badge, Button } from "@some-ui/shared"
import { Plus } from "lucide-react"
import { cn } from "some-ui-utils"

type LessonListProps = {
  lessons: Array<OperatorLesson>
  selected: string | null
  onSelect: (key: string) => void
  onNew: () => void
}

/**
 * Every lesson the server holds. Listed ones - the manifest, which is the
 * weekly batch learners choose from - come first; retired ones stay here,
 * because the server keeps them and a learner may still be part-way through
 * one.
 */
export const LessonList = ({
  lessons,
  selected,
  onSelect,
  onNew,
}: LessonListProps): JSX.Element => {
  const listed = lessons.filter((lesson) => lesson.retiredAt === null)
  const retired = lessons.filter((lesson) => lesson.retiredAt !== null)

  const group = (
    title: string,
    group: Array<OperatorLesson>
  ): JSX.Element | null =>
    group.length === 0 ? null : (
      <section className="flex flex-col gap-1">
        <h3 className="text-muted-foreground px-2 text-xs font-medium tracking-wider uppercase">
          {title} · {group.length}
        </h3>
        <ul className="flex flex-col gap-1">
          {group.map((lesson) => (
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
                <span className="text-sm font-medium">
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
      </section>
    )

  return (
    <nav aria-label="Lessons" className="flex flex-col gap-4">
      <Button variant="outline" className="gap-2" onClick={onNew}>
        <Plus className="size-4" /> New lesson
      </Button>
      {lessons.length === 0 && (
        <p className="text-muted-foreground px-2 text-sm">
          No lessons yet. Paste one to serve it.
        </p>
      )}
      {group("In the manifest", listed)}
      {group("Retired", retired)}
    </nav>
  )
}

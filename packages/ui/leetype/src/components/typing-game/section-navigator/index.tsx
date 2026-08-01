import type { FC } from "react"
import { useMemo, useState } from "react"
import type { Section, SectionProgress } from "@leetype/types/leetype"
import { Check, CornerUpLeft, ListTree, SkipForward } from "lucide-react"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  PageControls,
  Progress,
} from "@some-ui/shared"
import { cn, useFittedPage } from "some-ui-utils"

type SectionNavigatorProps = {
  sections: Array<Section>
  /**
   * Read lazily, when the dialog opens — the engine can produce this at any
   * time, and recomputing it on every keystroke would be pure waste for a
   * panel that is closed almost always.
   */
  readProgress: () => Array<SectionProgress>
  /** Section the caret currently sits in, if any. */
  currentSection: number | null
  /**
   * Whether any earlier work was left unfinished. Present exactly when
   * "resume" has somewhere to go.
   */
  hasUnfinishedWork: boolean
  onJumpToSection: (section: number) => void
  onResume: () => void
  disabled?: boolean
  portalContainer?: HTMLElement | null
}

type Row = {
  section: Section
  done: number
  total: number
  percent: number
  state: "done" | "started" | "untouched"
}

function buildRows(
  sections: Array<Section>,
  progress: Array<SectionProgress>
): Array<Row> {
  return sections.map((section): Row => {
    const entry = progress[section.index]
    const total = entry?.slotCount ?? section.endSlot - section.startSlot
    const done = entry?.correct ?? 0
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)

    return {
      section,
      done,
      total,
      percent,
      state: percent === 100 ? "done" : done > 0 ? "started" : "untouched",
    }
  })
}

const STATE_LABEL: Record<Row["state"], string> = {
  done: "Done",
  started: "In progress",
  untouched: "Not started",
}

/**
 * Lets a player move around the chunk without ever meeting the engine's
 * vocabulary.
 *
 * Internally a jump is "put the caret on slot j". That is not a thing
 * anyone wants to think about mid-session, so this panel only ever offers
 * two intentions: *skip ahead* to a named region of the code, and *resume*
 * whatever was left unfinished behind you. Sections are cut at the code's
 * own top-level boundaries, so the labels read like the file does.
 */
export const SectionNavigator: FC<SectionNavigatorProps> = ({
  sections,
  readProgress,
  currentSection,
  hasUnfinishedWork,
  onJumpToSection,
  onResume,
  disabled = false,
  portalContainer,
}) => {
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<Array<SectionProgress>>([])

  const rows = useMemo(
    () => buildRows(sections, progress),
    [sections, progress]
  )

  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(rows)

  const handleOpenChange = (next: boolean): void => {
    // Snapshot progress on the way in: the panel is a still frame of the
    // run, and the run is paused behind the dialog anyway.
    if (next) setProgress(readProgress())
    setOpen(next)
  }

  const jump = (index: number): void => {
    onJumpToSection(index)
    setOpen(false)
  }

  const resume = (): void => {
    onResume()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Jump to a section"
          disabled={disabled || sections.length === 0}
        >
          <ListTree className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      {/* Bounded by the viewport and laid out as a column, so the list below
          is handed a definite height to fit into rather than being allowed to
          push the dialog past the screen. */}
      <DialogContent
        container={portalContainer}
        showOverlay
        className="flex max-h-[min(34rem,85vh)] max-w-2xl flex-col gap-4 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>Jump to a section</DialogTitle>
          <DialogDescription>
            Skip ahead to any part of the file, or pick up whatever you left
            unfinished. Nothing you have already typed is lost.
          </DialogDescription>
        </DialogHeader>

        {hasUnfinishedWork && (
          <Button
            onClick={resume}
            variant="secondary"
            className="w-full justify-start gap-2"
          >
            <CornerUpLeft className="h-4 w-4" />
            Resume where you left off
          </Button>
        )}

        {/* The one genuinely unbounded list here - a chunk can carry any
            number of sections - so it pages to whatever the box fits instead
            of growing a scrollbar. */}
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
          <div ref={contentRef}>
            <ul className="flex flex-col gap-1.5">
              {pageItems.map((row) => (
                <li key={row.section.index}>
                  <button
                    type="button"
                    onClick={() => jump(row.section.index)}
                    className={cn(
                      "w-full rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                      row.section.index === currentSection &&
                        "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        L{row.section.startLine + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-card-foreground">
                        {row.section.label}
                      </span>
                      {row.section.index === currentSection ? (
                        <Badge variant="default" className="shrink-0 text-xs">
                          Here
                        </Badge>
                      ) : row.state === "done" ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 gap-1 text-xs"
                        >
                          <Check className="h-3 w-3" />
                          {STATE_LABEL.done}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-1 text-xs"
                        >
                          <SkipForward className="h-3 w-3" />
                          {STATE_LABEL[row.state]}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={row.percent} className="h-1 flex-1" />
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {row.done}/{row.total}
                      </span>
                    </div>
                  </button>
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
          label="sections"
        />
      </DialogContent>
    </Dialog>
  )
}

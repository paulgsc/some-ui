import { toneDotClass, toneTextClass } from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { cn } from "some-ui-utils"

type Props = {
  milestones: ReadonlyArray<Milestone>
  activeIndex: number
  onSelect: (index: number) => void
  className?: string
}

/**
 * A vertical dot-and-line timeline, one row per milestone. The open row is
 * driven entirely by `activeIndex` (owned by `useMilestoneCycle`) rather
 * than the accordion's own internal state, so the cyclical auto-advance and
 * a manual click land in the exact same place the paired dice card does.
 */
export const MilestoneTimeline = ({
  milestones,
  activeIndex,
  onSelect,
  className,
}: Props): React.JSX.Element => {
  const activeId = milestones[activeIndex]?.id

  return (
    <AccordionPrimitive.Root
      type="single"
      value={activeId}
      onValueChange={(value) => {
        const index = milestones.findIndex(
          (milestone) => milestone.id === value
        )
        if (index >= 0) onSelect(index)
      }}
      className={cn("flex min-h-0 flex-col overflow-hidden", className)}
    >
      {milestones.map((milestone, index) => {
        const active = index === activeIndex
        const isLast = index === milestones.length - 1
        return (
          <AccordionPrimitive.Item
            key={milestone.id}
            value={milestone.id}
            className="flex gap-3"
          >
            <div
              className="flex w-4 shrink-0 flex-col items-center"
              aria-hidden
            >
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full transition-colors",
                  active
                    ? toneDotClass[milestone.tone]
                    : "bg-muted-foreground/40"
                )}
              />
              {!isLast && (
                <span className="mt-1 min-h-0 w-px flex-1 bg-border" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger
                  onClick={() => onSelect(index)}
                  className="flex w-full flex-col items-start gap-0.5 text-left"
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {milestone.timestamp}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-1 text-sm font-semibold",
                      active && toneTextClass[milestone.tone]
                    )}
                  >
                    {milestone.title}
                  </span>
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Content
                className={cn(
                  "overflow-hidden text-xs text-muted-foreground",
                  "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
                )}
              >
                <p className="line-clamp-2 pt-1">{milestone.reflection}</p>
              </AccordionPrimitive.Content>
            </div>
          </AccordionPrimitive.Item>
        )
      })}
    </AccordionPrimitive.Root>
  )
}

import {
  toneBorderClass,
  toneDotClass,
  toneTextClass,
} from "@milestones/lib/tone"
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
 * Single-open accordion whose open row is driven entirely by `activeIndex`
 * (owned by `useMilestoneCycle`) rather than its own internal state, so the
 * cyclical auto-advance and a manual click land in the exact same place the
 * dice card does.
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
      className={cn(
        "grid h-full auto-cols-fr grid-flow-col grid-rows-[minmax(0,1fr)] divide-x divide-border overflow-hidden rounded-lg border border-border",
        className
      )}
    >
      {milestones.map((milestone, index) => {
        const active = index === activeIndex
        return (
          <AccordionPrimitive.Item
            key={milestone.id}
            value={milestone.id}
            className={cn(
              "flex min-h-0 min-w-0 flex-col transition-colors",
              active && "bg-accent/40"
            )}
          >
            <AccordionPrimitive.Header className="shrink-0">
              <AccordionPrimitive.Trigger
                className="flex w-full flex-col items-start gap-1.5 p-3 text-left"
                onClick={() => onSelect(index)}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      toneDotClass[milestone.tone]
                    )}
                    aria-hidden
                  />
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
                "min-h-0 flex-1 overflow-hidden border-t px-3 text-xs text-muted-foreground",
                "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
                toneBorderClass[milestone.tone]
              )}
            >
              <p className="line-clamp-2 py-2">{milestone.reflection}</p>
            </AccordionPrimitive.Content>
          </AccordionPrimitive.Item>
        )
      })}
    </AccordionPrimitive.Root>
  )
}

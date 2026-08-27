import {
  toneDotClass,
  toneTextClass,
  toneWashClass,
} from "@milestones/lib/tone"
import type { Milestone, MilestonePeriod } from "@milestones/types"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"
import { cn } from "some-ui-utils"

type Props = {
  milestones: ReadonlyArray<Milestone>
  activeIndex: number
  onSelect: (index: number) => void
  className?: string
}

const periods: ReadonlyArray<{
  id: MilestonePeriod
  label: string
}> = [
  { id: "previously", label: "Previously" },
  { id: "currently", label: "Currently" },
  { id: "upcoming", label: "Upcoming" },
]

/**
 * A three-period dot-and-line timeline, grouped into previously, currently,
 * and upcoming sections. The open row is driven entirely by `activeIndex`
 * (owned by `useMilestoneCycle`) rather than the accordion's internal state,
 * so cyclical auto-advance and manual selection stay paired with the dice.
 */
export const MilestoneTimeline = ({
  milestones,
  activeIndex,
  onSelect,
  className,
}: Props): React.JSX.Element => {
  const activeId = milestones[activeIndex]?.id

  return (
    <div
      className={cn(
        "relative min-h-0 max-w-full overflow-hidden rounded-3xl border-2 border-foreground bg-card shadow-[10px_12px_0_var(--foreground),0_24px_45px_color-mix(in_oklab,var(--foreground)_18%,transparent)]",
        className
      )}
    >
      <div className="h-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400" />

      <AccordionPrimitive.Root
        type="single"
        value={activeId}
        onValueChange={(value) => {
          const index = milestones.findIndex(
            (milestone) => milestone.id === value
          )
          if (index >= 0) onSelect(index)
        }}
        className="flex h-[calc(100%-0.5rem)] min-h-0 flex-col gap-3 overflow-hidden px-5 py-5 sm:px-7"
      >
        {periods.map((period) => {
          const periodMilestones = milestones
            .map((milestone, index) => ({ milestone, index }))
            .filter(({ milestone }) => milestone.period === period.id)

          return (
            <section
              key={period.id}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              aria-labelledby={`milestone-period-${period.id}`}
            >
              <h3
                id={`milestone-period-${period.id}`}
                className="mb-1.5 shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground"
              >
                {period.label}
              </h3>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {periodMilestones.map(({ milestone, index }, periodIndex) => {
                  const active = index === activeIndex
                  const isLast = periodIndex === periodMilestones.length - 1

                  return (
                    <AccordionPrimitive.Item
                      key={milestone.id}
                      value={milestone.id}
                      className="flex min-h-0 flex-1 gap-3 overflow-hidden"
                    >
                      <div
                        className="flex w-4 shrink-0 flex-col items-center"
                        aria-hidden
                      >
                        <span
                          className={cn(
                            "z-10 mt-1.5 size-3 shrink-0 rounded-full border-2 border-foreground shadow-[0_0_0_3px_var(--card)] transition-transform",
                            active
                              ? toneDotClass[milestone.tone]
                              : "bg-muted-foreground/40",
                            active && "scale-125"
                          )}
                        />
                        {!isLast && (
                          <span className="min-h-0 w-0.5 flex-1 bg-foreground/15" />
                        )}
                      </div>

                      <div className="min-h-0 min-w-0 flex-1 overflow-hidden pb-2">
                        <AccordionPrimitive.Header>
                          <AccordionPrimitive.Trigger
                            onClick={() => onSelect(index)}
                            className={cn(
                              "group flex w-full min-w-0 items-center justify-between overflow-hidden rounded-2xl border-2 border-transparent px-3 py-2 text-left outline-none transition-all hover:border-foreground/20 hover:bg-accent/70 focus-visible:ring-4 focus-visible:ring-ring/30",
                              active &&
                                `border-foreground bg-gradient-to-r ${toneWashClass[milestone.tone]} shadow-[5px_6px_0_var(--foreground)]`
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                {milestone.timestamp}
                              </span>
                              <span
                                className={cn(
                                  "mt-1 line-clamp-1 block text-sm font-extrabold leading-6 text-foreground",
                                  active && toneTextClass[milestone.tone]
                                )}
                              >
                                {milestone.title}
                              </span>
                            </span>
                            <ChevronDown
                              className="ml-3 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                              aria-hidden
                            />
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>

                        <AccordionPrimitive.Content
                          className={cn(
                            "max-h-20 overflow-hidden",
                            "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
                          )}
                        >
                          <div className="px-4">
                            <p className="line-clamp-2 pt-2 text-xs leading-5 text-muted-foreground">
                              {milestone.reflection}
                            </p>
                            <span className="mt-3 inline-block rounded-full border-2 border-foreground bg-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
                              {milestone.category}
                            </span>
                          </div>
                        </AccordionPrimitive.Content>
                      </div>
                    </AccordionPrimitive.Item>
                  )
                })}
              </div>
            </section>
          )
        })}
      </AccordionPrimitive.Root>
    </div>
  )
}

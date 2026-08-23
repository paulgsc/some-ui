import {
  toneDotClass,
  toneTextClass,
  toneWashClass,
} from "@milestones/lib/tone"
import type { Milestone } from "@milestones/types"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"
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
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border-2 border-slate-950 bg-slate-50 shadow-[10px_12px_0_theme(colors.slate.950),0_24px_45px_theme(colors.slate.950/0.14)] dark:border-slate-200 dark:bg-slate-950 dark:shadow-[10px_12px_0_theme(colors.slate.200),0_24px_45px_theme(colors.black/0.4)]",
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
        className="flex min-h-0 flex-col overflow-hidden px-6 py-7 sm:px-8"
      >
        {milestones.map((milestone, index) => {
          const active = index === activeIndex
          const isLast = index === milestones.length - 1

          return (
            <AccordionPrimitive.Item
              key={milestone.id}
              value={milestone.id}
              className="flex gap-4"
            >
              <div
                className="flex w-4 shrink-0 flex-col items-center"
                aria-hidden
              >
                <span
                  className={cn(
                    "z-10 mt-1.5 size-3 shrink-0 rounded-full border-2 border-slate-950 shadow-[0_0_0_3px_theme(colors.slate.50)] transition-transform dark:border-slate-200 dark:shadow-[0_0_0_3px_theme(colors.slate.950)]",
                    active
                      ? toneDotClass[milestone.tone]
                      : "bg-muted-foreground/40",
                    active && "scale-125"
                  )}
                />
                {!isLast && (
                  <span className="w-0.5 flex-1 bg-slate-950/15 dark:bg-slate-200/15" />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-4">
                <AccordionPrimitive.Header>
                  <AccordionPrimitive.Trigger
                    onClick={() => onSelect(index)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-2xl border-2 border-transparent px-4 py-3 text-left outline-none transition-all hover:border-slate-950/20 hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-cyan-500/30 dark:hover:border-slate-200/20 dark:hover:bg-slate-900/70",
                      active &&
                        `border-slate-950 bg-gradient-to-r ${toneWashClass[milestone.tone]} shadow-[5px_6px_0_theme(colors.slate.950)] dark:border-slate-200 dark:shadow-[5px_6px_0_theme(colors.slate.200)]`
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {milestone.timestamp}
                      </span>
                      <span
                        className={cn(
                          "mt-1 line-clamp-1 block text-sm font-extrabold leading-6 text-slate-950 dark:text-white",
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
                    "overflow-hidden",
                    "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
                  )}
                >
                  <div className="px-4">
                    <p className="line-clamp-2 pt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {milestone.reflection}
                    </p>
                    <span className="mt-3 inline-block rounded-full border-2 border-slate-950 bg-slate-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-950">
                      {milestone.category}
                    </span>
                  </div>
                </AccordionPrimitive.Content>
              </div>
            </AccordionPrimitive.Item>
          )
        })}
      </AccordionPrimitive.Root>
    </div>
  )
}

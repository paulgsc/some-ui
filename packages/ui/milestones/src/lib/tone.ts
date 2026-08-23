import type { MilestoneTone } from "@milestones/types"

/**
 * Plain Tailwind palette classes, not bespoke hex/oklch values — these
 * already carry a light/dark pair and sit on top of the shared
 * `@some-ui/styles` tokens the rest of this workspace uses, so a milestone
 * face stays legible under every theme without this package owning its own
 * color system.
 */
export const toneTextClass: Record<MilestoneTone, string> = {
  joy: "text-emerald-600 dark:text-emerald-400",
  relief: "text-sky-600 dark:text-sky-400",
  grind: "text-amber-600 dark:text-amber-400",
  dread: "text-violet-600 dark:text-violet-400",
  rage: "text-rose-600 dark:text-rose-400",
}

export const toneBorderClass: Record<MilestoneTone, string> = {
  joy: "border-emerald-500/40",
  relief: "border-sky-500/40",
  grind: "border-amber-500/40",
  dread: "border-violet-500/40",
  rage: "border-rose-500/40",
}

export const toneDotClass: Record<MilestoneTone, string> = {
  joy: "bg-emerald-500",
  relief: "bg-sky-500",
  grind: "bg-amber-500",
  dread: "bg-violet-500",
  rage: "bg-rose-500",
}

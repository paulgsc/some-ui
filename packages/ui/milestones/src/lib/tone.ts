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

export const toneWashClass: Record<MilestoneTone, string> = {
  joy: "from-emerald-100/80 to-cyan-100/70 dark:from-emerald-950/70 dark:to-cyan-950/60",
  relief:
    "from-sky-100/80 to-blue-100/70 dark:from-sky-950/70 dark:to-blue-950/60",
  grind:
    "from-amber-100/80 to-orange-100/70 dark:from-amber-950/70 dark:to-orange-950/60",
  dread:
    "from-violet-100/80 to-fuchsia-100/70 dark:from-violet-950/70 dark:to-fuchsia-950/60",
  rage: "from-rose-100/80 to-orange-100/70 dark:from-rose-950/70 dark:to-orange-950/60",
}

// lib/tone.ts — add alongside the existing exports
export const toneTintClass: Record<MilestoneTone, string> = {
  joy: "from-emerald-100 via-teal-50 to-card dark:from-emerald-950/70 dark:via-teal-950/40 dark:to-card",
  relief:
    "from-sky-100 via-blue-50 to-card dark:from-sky-950/70 dark:via-blue-950/40 dark:to-card",
  grind:
    "from-amber-100 via-orange-50 to-card dark:from-amber-950/70 dark:via-orange-950/40 dark:to-card",
  dread:
    "from-violet-100 via-fuchsia-50 to-card dark:from-violet-950/70 dark:via-fuchsia-950/40 dark:to-card",
  rage: "from-rose-100 via-orange-50 to-card dark:from-rose-950/70 dark:via-orange-950/40 dark:to-card",
}

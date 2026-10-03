/**
 * How an entry looks at a glance: one colour, one icon and one word per
 * reconciliation status, plus where the standing figure sits against the
 * goal. Every colour is a theme token (`--success`, `--warning`,
 * `--destructive`, `--muted-foreground`, `--chart-*`), so each theme
 * restyles aph without aph knowing which one is on.
 */
import type { ComponentType, JSX } from "react"
import type { AphSettings, Entry, ReconcileStatus } from "@aph/lib/model"
import {
  checkpointById,
  formatDelta,
  formatValue,
  goalDelta,
} from "@aph/lib/model"
import {
  CheckCheck,
  CircleCheck,
  Clock,
  Flag,
  TriangleAlert,
} from "lucide-react"
import { cn } from "some-ui-utils"

type StatusLook = {
  label: string
  icon: ComponentType<{ className?: string }>
  /** Text and icon colour. */
  tone: string
  /** A tint for a surface that carries the status. */
  surface: string
}

/**
 * Green is settled, amber waits on me, red is a dispute, and grey is still
 * waiting on them. "Agreed" shares green with "matched" but not the icon: I
 * settled it, it did not settle itself.
 */
export const STATUS: Record<ReconcileStatus, StatusLook> = {
  matched: {
    label: "Reconciled",
    icon: CircleCheck,
    tone: "text-success",
    surface: "bg-success/10 border-success/30",
  },
  agreed: {
    label: "Agreed",
    icon: CheckCheck,
    tone: "text-success",
    surface: "bg-success/10 border-success/30 border-dashed",
  },
  awaiting: {
    label: "Awaiting theirs",
    icon: Clock,
    tone: "text-muted-foreground",
    surface: "bg-muted/40 border-border border-dashed",
  },
  review: {
    label: "Your call",
    icon: TriangleAlert,
    tone: "text-warning",
    surface: "bg-warning/10 border-warning/40",
  },
  flagged: {
    label: "Flagged",
    icon: Flag,
    tone: "text-destructive",
    surface:
      "bg-destructive/10 border-destructive/40 shadow-[var(--glow-destructive)]",
  },
}

export const StatusIcon = ({
  status,
  className,
}: {
  status: ReconcileStatus
  className?: string
}): JSX.Element => {
  const { icon: Icon, tone } = STATUS[status]
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0",
        tone,
        status === "review" && "motion-safe:animate-pulse",
        className
      )}
    />
  )
}

export const StatusBadge = ({
  status,
  className,
}: {
  status: ReconcileStatus
  className?: string
}): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
      STATUS[status].surface,
      STATUS[status].tone,
      className
    )}
  >
    <StatusIcon status={status} className="size-3.5" />
    {STATUS[status].label}
  </span>
)

/**
 * A checkpoint's own colour, from theme tokens so it follows the theme.
 * Shape tells them apart too (a dot, a square), for when colour alone is
 * not enough.
 */
const CHECKPOINT_TONES = [
  "var(--chart-2)",
  // Not a second chart tone: the default palette's are all one blue, and two
  // of them side by side differ too little. The foreground always stands
  // apart from both the background and a mid chart tone, in every theme.
  "var(--foreground)",
  "var(--chart-4)",
]

export function checkpointTone(
  settings: AphSettings,
  checkpoint: string | null
): string {
  const i = settings.checkpoints.findIndex((c) => c.id === checkpoint)
  return i === -1
    ? "var(--muted-foreground)"
    : (CHECKPOINT_TONES[i % CHECKPOINT_TONES.length] ??
        "var(--muted-foreground)")
}

export const CheckpointMark = ({
  settings,
  checkpoint,
}: {
  settings: AphSettings
  checkpoint: string | null
}): JSX.Element => {
  const i = settings.checkpoints.findIndex((c) => c.id === checkpoint)
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0",
        i % 2 === 0 ? "rounded-full" : "rounded-[2px]"
      )}
      style={{ background: checkpointTone(settings, checkpoint) }}
    />
  )
}

/** "7:00", the clock time as written, or "time?" when none was. */
export function whenOf(settings: AphSettings, entry: Entry): string {
  return (
    checkpointById(settings, entry.checkpoint)?.label ?? entry.time ?? "time?"
  )
}

/** How far a meter reaches either side of the goal before it pins. */
const METER_SPAN = 1500

/**
 * Where the standing figure sits against the goal: a track with the goal at
 * its middle and a mark that slides off it, pinned at the ends past
 * `METER_SPAN`. Above or below is not called good or bad: aph's direction
 * is not this component's to judge.
 */
export const GoalMeter = ({
  entry,
  className,
}: {
  entry: Entry
  className?: string
}): JSX.Element | null => {
  const d = goalDelta(entry)
  if (d === null) return null
  const clamped = Math.max(-METER_SPAN, Math.min(METER_SPAN, d))
  const left = 50 + (clamped / METER_SPAN) * 50
  return (
    <span
      className={cn("flex items-center gap-2", className)}
      title={`${formatDelta(d)} against the goal of ${formatValue(entry.goal ?? 0)}`}
    >
      <span className="bg-muted relative h-1.5 w-16 rounded-full">
        <span className="bg-foreground/40 absolute -top-0.5 left-1/2 h-2.5 w-px" />
        <span
          className="bg-primary absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
          style={{ left: `${left}%` }}
        />
      </span>
      <span className="font-mono text-xs tabular-nums">{formatDelta(d)}</span>
    </span>
  )
}

/** Mine and theirs side by side, theirs a dash until it comes in. */
export const Figures = ({
  entry,
  className,
}: {
  entry: Entry
  className?: string
}): JSX.Element => (
  <span
    className={cn(
      "flex items-baseline gap-2 font-mono tabular-nums",
      className
    )}
  >
    <span>
      {entry.mine === null
        ? "—"
        : formatValue(entry.mine.value, entry.mine.approx)}
    </span>
    <span className="text-muted-foreground text-xs">vs</span>
    <span className={cn(entry.theirs === null && "text-muted-foreground")}>
      {entry.theirs === null ? "—" : formatValue(entry.theirs.value)}
    </span>
  </span>
)

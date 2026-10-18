import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"

/**
 * Why the drill reads at its level, when that is not simply the level the
 * learner holds: the held level is above the drill's highest, or an opened
 * set reads at its own.
 */
export type LevelReason = "held" | "highest" | "set"

const REASON_LABEL: Record<LevelReason, string> = {
  held: "",
  highest: " (highest)",
  set: " (this set's)",
}

/**
 * The header read-aloud's two sessions share: the way out, the title, the
 * level in sight throughout (Cor. 4.6 (ii)), saying why when it is not the
 * level held, and the set's progress once a set is under way.
 */
export const SessionHeader = ({
  title,
  level,
  levelReason = "held",
  short,
  exit,
  trailing,
  progress,
}: {
  title: string
  level: ReadAloudLevel
  levelReason?: LevelReason
  short: boolean
  exit: { label: string; icon: ReactNode; onClick: () => void }
  /** Controls after the level, such as read-aloud's pause. */
  trailing?: ReactNode
  /** Items done of the set's; null before a set. */
  progress: { done: number; of: number } | null
}): JSX.Element => (
  <header className="shrink-0">
    <div
      className={cn("flex items-center gap-2 px-2", short ? "h-11" : "h-14")}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        onClick={exit.onClick}
        aria-label={exit.label}
      >
        {exit.icon}
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
        {title}
      </h1>
      <span
        data-slot="read-aloud-level"
        className="bg-primary/15 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold last:mr-2"
      >
        TOPIK {level}
        {REASON_LABEL[levelReason]}
      </span>
      {trailing}
    </div>
    {progress && progress.of > 0 && (
      <div
        role="progressbar"
        aria-label="Progress through this set"
        aria-valuemin={0}
        aria-valuemax={progress.of}
        aria-valuenow={Math.min(progress.done, progress.of)}
        className="bg-muted h-1 w-full"
      >
        <div
          className="bg-primary h-full rounded-r-full transition-[width] duration-300"
          style={{
            width: `${(Math.min(progress.done, progress.of) / progress.of) * 100}%`,
          }}
        />
      </div>
    )}
  </header>
)

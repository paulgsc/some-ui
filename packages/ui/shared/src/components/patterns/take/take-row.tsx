import type { JSX, ReactNode } from "react"
import type { TakeRowView } from "@some-ui/voice-capture"
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { Pause, Play } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"

export type TakeRowProps = {
  /** One take as the pattern shows it: `takeItemView(...).current[i]`. */
  row: TakeRowView
  /** Plays the take, or stops it while it plays. */
  onPlay: () => void
  /** Records it again (D2); absent for a take that offers no Redo. */
  onRedo?: (() => void) | undefined
  /** Sets it aside (D3); absent for a take that offers no Let go. */
  onLetGo?: (() => void) | undefined
  /** The screen's words about what the take answers, under its length. */
  children?: ReactNode
  className?: string
}

/**
 * One take (MIC2, #2372): where it is kept and how long it is, Play and
 * Stop, Redo, and Let it go. Let it go sets the take aside (D3), which keeps
 * it, so it asks nothing first; a step that can't be undone would go through
 * `ConfirmSheet`, and the pattern has none. A control the row can't offer
 * now (a take under way) stays in place, disabled, so nothing jumps.
 */
export const TakeRow = ({
  row,
  onPlay,
  onRedo,
  onLetGo,
  children,
  className,
}: TakeRowProps): JSX.Element => {
  const words = TAKE_WORDS
  const { take } = row
  const action = row.playing ? words.stop : words.play
  return (
    <li
      className={cn(
        "bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button
          size="icon"
          className="bg-brand text-brand-foreground hover:bg-brand/85 size-11 shrink-0 rounded-full"
          onClick={onPlay}
          disabled={!row.canPlay && !row.playing}
          aria-label={words.rowLabel(action, take.durationMs)}
        >
          {row.playing ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className="tabular-nums">
              {words.length(take.durationMs)}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {words.place[take.place]}
            </span>
          </p>
          {children !== undefined && (
            <div className="text-muted-foreground truncate text-xs">
              {children}
            </div>
          )}
        </div>
      </div>
      {(onRedo !== undefined || onLetGo !== undefined) && (
        <div className="flex flex-wrap justify-end gap-1">
          {onRedo !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRedo}
              disabled={!row.canRedo}
              aria-label={words.rowLabel(words.redo, take.durationMs)}
            >
              {words.redo}
            </Button>
          )}
          {onLetGo !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={onLetGo}
              disabled={!row.canLetGo}
              aria-label={words.rowLabel(words.letGo, take.durationMs)}
            >
              {words.letGo}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

import type { JSX, ReactNode } from "react"
import type { TakeRowView } from "@some-ui/voice-capture"
import { keptSaid, TAKE_WORDS } from "@some-ui/voice-capture"
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
  /**
   * The screen's own action on this take, beside Redo and Let it go: the
   * pattern's named slot for an extra a screen keeps (Soundbites' "Replace
   * this one next", Studio's word fixing, ST24 #2322).
   */
  extra?: ReactNode
  className?: string
}

/**
 * One take: how long it is and where it is kept, since when once home
 * holds it (MIC3), Play and Stop, Redo, and Let it go. Let it go sets the
 * take aside (D3), which keeps it, so it asks nothing first. A take that
 * never left the phone under `send: "on-confirm"` (`row.unsent`) says so,
 * and offers Delete instead, which deletes it for good: the screen asks
 * first (`ConfirmSheet`), since that can't be undone.
 * A control the row can't offer now (a take under way) stays in place,
 * disabled, so nothing jumps.
 */
export const TakeRow = ({
  row,
  onPlay,
  onRedo,
  onLetGo,
  children,
  extra,
  className,
}: TakeRowProps): JSX.Element => {
  const words = TAKE_WORDS
  const { take } = row
  const action = row.playing ? words.stop : words.play
  const letGo = row.unsent ? words.discard : words.letGo
  return (
    <li
      className={cn(
        "bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
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
            {take.kept !== null && (
              <span className="text-muted-foreground">
                {" · "}
                {row.unsent ? words.place.unsent : keptSaid(words, take.kept)}
              </span>
            )}
          </p>
          {children !== undefined && (
            <div className="text-muted-foreground truncate text-xs">
              {children}
            </div>
          )}
        </div>
      </div>
      {(onRedo !== undefined ||
        onLetGo !== undefined ||
        extra !== undefined) && (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {extra}
          {onRedo !== undefined && (
            <Button
              type="button"
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
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={onLetGo}
              disabled={!row.canLetGo}
              aria-label={words.rowLabel(letGo, take.durationMs)}
            >
              {letGo}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

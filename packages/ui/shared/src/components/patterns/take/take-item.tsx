import type { JSX, ReactNode } from "react"
import { useState } from "react"
import type {
  PatternTake,
  TakeItemView,
  TakePlace,
  TakeRowView,
  TakeSaid,
  TakeWords,
} from "@some-ui/voice-capture"
import { TAKE_WORDS, takeSaid } from "@some-ui/voice-capture"

import { cn } from "../../../lib/utils"
import { Notice } from "../../ui/notice"
import type { TakeButtonProps } from "./take-button"
import { TakeButton } from "./take-button"
import { TakeRow } from "./take-row"

export type TakeItemProps = {
  /** What the parts show for the item: `takeItemView(...)`. */
  view: TakeItemView
  /** D1: the button's tap, which starts a take or stops the one under way. */
  onTap: () => void
  /** Plays a take, or stops it while it plays. */
  onPlay: (id: string) => void
  /** Records a current take again (D2). */
  onRedo: (id: string) => void
  /** Sets a current take aside (D3); `place` is where it is kept. */
  onLetGo: (id: string, place: TakePlace) => void
  /**
   * Opens My data on a take that is a record home marks deletable (MD4,
   * the pattern's `records: "delete-in-my-data"`); absent, no row offers
   * Delete….
   */
  onDelete?: ((id: string) => void) | undefined
  /** What the item is, for a screen reader. */
  label?: string
  /** The screen's words about one take, under its length. */
  describe?: (take: PatternTake) => ReactNode
  /**
   * What is said of the last take, where a screen's store says more than the
   * pattern's table can (its way to make room when full): `TAKE_WORDS`,
   * spread, unless given.
   */
  words?: TakeWords
  /**
   * The screen's own action on one of the item's current takes: the row's
   * named `extra` slot (`TakeRow`).
   */
  extra?: (row: TakeRowView) => ReactNode
  /**
   * Set while the screen's store keeps no new take (a phone full until home
   * has some): these words say what makes room, and the button and each
   * row's Redo, which record one, stay where they are, disabled. Every take
   * still plays, and a current one can still be let go.
   */
  full?: ReactNode
  className?: string
} & Pick<TakeButtonProps, "size">

/** Which saying `said` is, so a dismissed one stays dismissed until another. */
function sayingOf(said: TakeSaid, line: string): string {
  return said.kind === "ended"
    ? `ended ${said.ended.seq}`
    : `${said.kind} ${line}`
}

/**
 * One item's takes, from its view: the take button, then the item's current
 * takes, then the earlier ones a Redo superseded, collapsed (D2). What is
 * said of the last take (how it ended, a take set aside, a take that
 * couldn't play) and that the phone is full are said over the screen
 * (`Notice`), so nothing here moves when they come and go (HS1). It renders
 * `view` and forwards what is tapped, so a screen whose own machine stands
 * between a tap and the pattern (Rust Rounds' card, LeetType's answer) uses
 * the same parts as `TakeList`, which wires them to the pattern directly.
 */
export const TakeItem = ({
  view,
  onTap,
  onPlay,
  onRedo,
  onLetGo,
  onDelete,
  label,
  describe,
  words = TAKE_WORDS,
  extra,
  full,
  size,
  className,
}: TakeItemProps): JSX.Element => {
  const { said } = view
  const line = said === null ? null : takeSaid(words, said)
  const saying = said === null || line === null ? null : sayingOf(said, line)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [fullDismissed, setFullDismissed] = useState(false)
  // Gone, so the next one is said again.
  if (saying === null && dismissed !== null) setDismissed(null)
  if (full === undefined && fullDismissed) setFullDismissed(false)
  return (
    <section
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-col items-center">
        <TakeButton
          view={view.button}
          size={size}
          onTap={onTap}
          canStart={full === undefined}
        />
      </div>
      {full !== undefined && !fullDismissed && (
        <Notice
          role="status"
          tone="warning"
          onDismiss={() => setFullDismissed(true)}
        >
          {full}
        </Notice>
      )}
      {full === undefined && said !== null && saying !== dismissed && (
        <Notice role="status" onDismiss={() => setDismissed(saying)}>
          <span
            data-take-ended={said.kind === "ended" ? said.ended.seq : undefined}
          >
            {line}
          </span>
        </Notice>
      )}
      <TakeRows
        view={view}
        onPlay={onPlay}
        onRedo={onRedo}
        canRedo={full === undefined}
        onLetGo={onLetGo}
        onDelete={onDelete}
        describe={describe}
        extra={extra}
      />
    </section>
  )
}

export type TakeRowsProps = Pick<
  TakeItemProps,
  "view" | "onPlay" | "onLetGo" | "onDelete" | "describe" | "extra"
> & {
  /** Records a current take again (D2). */
  onRedo?: TakeItemProps["onRedo"] | undefined
  /**
   * False while no new take is kept (a phone full): Redo, which records
   * one, stays in each row, disabled.
   */
  canRedo?: boolean
}

/**
 * An item's takes as rows: its current takes, then the earlier ones a Redo
 * superseded, collapsed (D2). `TakeItem` draws them under its button; a
 * screen whose button sits apart from its list (the Soundbites page, its
 * button in the header) draws `TakeButton` and these where each goes.
 */
export const TakeRows = ({
  view,
  onPlay,
  onRedo,
  canRedo = true,
  onLetGo,
  onDelete,
  describe,
  extra,
}: TakeRowsProps): JSX.Element => {
  const deleting = (id: string): (() => void) | undefined =>
    onDelete === undefined ? undefined : (): void => onDelete(id)
  const words = TAKE_WORDS
  return (
    <>
      {view.current.length > 0 && (
        <ul className="space-y-2">
          {view.current.map((row) => (
            <TakeRow
              key={row.take.id}
              row={{
                ...row,
                canRedo: canRedo && row.canRedo,
                // A take on neither this phone nor home has nowhere to set
                // it aside.
                canLetGo: row.canLetGo && row.take.kept !== null,
              }}
              onPlay={() => onPlay(row.take.id)}
              onRedo={
                onRedo === undefined
                  ? undefined
                  : (): void => onRedo(row.take.id)
              }
              onLetGo={(): void =>
                onLetGo(row.take.id, row.take.kept?.place ?? "phone")
              }
              onDelete={deleting(row.take.id)}
              extra={extra?.(row)}
            >
              {describe?.(row.take)}
            </TakeRow>
          ))}
        </ul>
      )}
      {view.earlier.length > 0 && (
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
            {words.earlier(view.earlier.length)}
          </summary>
          <ul className="mt-2 space-y-2">
            {view.earlier.map((row) => (
              <TakeRow
                key={row.take.id}
                row={row}
                onPlay={() => onPlay(row.take.id)}
                onDelete={deleting(row.take.id)}
              >
                {describe?.(row.take)}
              </TakeRow>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

import type { JSX, ReactNode } from "react"
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

/** Which saying `said` is, so a closed one stays closed until another. */
function sayingOf(said: TakeSaid, line: string): string {
  return said.kind === "ended"
    ? `ended ${said.ended.seq}`
    : `${said.kind} ${line}`
}

export type TakeNoticesProps = {
  /** The item's view: what is said of its last take. */
  view: Pick<TakeItemView, "said">
  /** What is said of the last take: `TAKE_WORDS` unless given. */
  words?: TakeWords | undefined
  /**
   * Set while the screen's store keeps no new take: these words say what
   * makes room, said instead of the last take's.
   */
  full?: ReactNode
}

/**
 * What the take pattern says over the screen: that the phone is full, or
 * what the last take came to (how it ended, a take set aside, a take that
 * couldn't play). Each can be closed, and says itself again once it is new.
 */
export const TakeNotices = ({
  view,
  words = TAKE_WORDS,
  full,
}: TakeNoticesProps): JSX.Element | null => {
  if (full !== undefined)
    return (
      <Notice tone="warning" dismissible>
        {full}
      </Notice>
    )
  const { said } = view
  if (said === null) return null
  const line = takeSaid(words, said)
  return (
    <Notice
      key={sayingOf(said, line)}
      role={said.kind === "unplayable" ? "alert" : undefined}
      tone={said.kind === "unplayable" ? "warning" : "neutral"}
      dismissible
    >
      <span
        data-take-ended={said.kind === "ended" ? said.ended.seq : undefined}
      >
        {line}
      </span>
    </Notice>
  )
}

/**
 * One item's takes, from its view: the take button, then the item's current
 * takes, then the earlier ones a Redo superseded, collapsed (D2), with
 * `TakeNotices` saying what the last take came to. It renders
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
      <TakeNotices view={view} words={words} full={full} />
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

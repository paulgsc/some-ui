/**
 * What uses a take, drawn once (INUSE, C1360, C1361): `UsesPanel` says each
 * use and what deleting the take does to it, and both the delete sheet and
 * a row's mark show that one panel. `UseMark` is the one mark every list
 * puts on a take something uses, the same for every kind of use (the owner,
 * 2026-11-22): an icon and a count, and a distinct mark when this phone
 * couldn't check; tapping it opens the panel. Every word is
 * `lib/take-uses`' `USE_WORDS`. Phone build only.
 */
import type { JSX } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@some-ui/shared"
import { CircleHelp, Layers, LoaderCircle, TriangleAlert } from "lucide-react"

import type { TakeUse, UseSource } from "@/lib/take-uses"
import { USE_WORDS, whatLoses } from "@/lib/take-uses"

/** What the panel says: checking, or what was read of the takes it names. */
export type PanelUses =
  | { readonly kind: "checking" }
  | {
      readonly kind: "read"
      readonly uses: ReadonlyArray<TakeUse>
      readonly unread: ReadonlyArray<UseSource>
      /** Asked again: a use appeared after the sheet first showed. */
      readonly changed?: boolean
    }

/** Whether the panel has anything to say; nothing when all read and unused. */
export const panelSays = (uses: PanelUses): boolean =>
  uses.kind === "checking" || uses.uses.length > 0 || uses.unread.length > 0

/** Each use, what deleting the take does to it, and what couldn't be read. */
export const UsesPanel = ({ uses }: { uses: PanelUses }): JSX.Element => {
  const title =
    uses.kind === "checking"
      ? USE_WORDS.checkingTitle
      : uses.uses.length > 0
        ? USE_WORDS.inUseTitle
        : USE_WORDS.uncheckedTitle
  const lines =
    uses.kind === "checking"
      ? [USE_WORDS.checking]
      : [
          ...(uses.changed === true ? [USE_WORDS.changed] : []),
          ...uses.uses.map((use) => whatLoses(use)),
          ...(uses.unread.length > 0 ? [USE_WORDS.unread(uses.unread)] : []),
        ]
  return (
    <div
      className="border-warning/60 space-y-2.5 rounded-2xl border-2 p-4 text-sm"
      role={uses.kind === "read" && uses.uses.length > 0 ? "alert" : undefined}
    >
      <p className="text-warning text-xs font-bold tracking-wide uppercase">
        {title}
      </p>
      <ul className="space-y-2.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            {uses.kind === "checking" ? (
              <LoaderCircle
                className="text-muted-foreground mt-0.5 size-4 shrink-0 animate-spin"
                aria-hidden
              />
            ) : (
              <TriangleAlert
                className="text-warning mt-0.5 size-4 shrink-0"
                aria-hidden
              />
            )}
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A take's mark: an icon and how many things use it, or a distinct mark when
 * nothing found uses it but a store couldn't be read; nothing otherwise.
 * Tapping it opens `UsesPanel` over the same uses.
 */
export const UseMark = ({
  uses,
  unread,
}: {
  uses: ReadonlyArray<TakeUse>
  unread: ReadonlyArray<UseSource>
}): JSX.Element | null => {
  const used = uses.length > 0
  if (!used && unread.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            used ? USE_WORDS.markName(uses.length) : USE_WORDS.uncheckedName
          }
          className={
            used
              ? "border-success/50 bg-success/10 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-xs tabular-nums"
              : "border-warning/50 text-warning inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-dashed px-2.5 text-xs"
          }
        >
          {used ? (
            <>
              <Layers className="text-success size-4" aria-hidden />
              <span aria-hidden>{uses.length}</span>
            </>
          ) : (
            <CircleHelp className="size-4" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,86vw)] p-0">
        <UsesPanel uses={{ kind: "read", uses, unread }} />
      </PopoverContent>
    </Popover>
  )
}

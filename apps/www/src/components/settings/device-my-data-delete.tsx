/**
 * My data's delete sheet (MY-DATA MD3, #2477), as the prototype agreed
 * (boards 5, 6, 7 and 10 of https://claude.ai/artifact/5BvL59CmrjzxQ2JbUj15PN):
 * what goes and what stays, asked once with "Keep it" first; then the
 * receipt, or "Nothing was deleted" and why, with Try again only where home
 * didn't answer. It draws `lib/my-data`'s `DeleteSheet` and calls back; the
 * delete itself is `lib/my-data/deleting-runtime`'s. Every word is
 * `lib/my-data/words`' `DELETING`. Phone build only.
 *
 * LA19 (docs/learner-data-authority.md): `onConfirm` is the only way a
 * delete starts, from a sheet that has said what goes and what stays.
 */
import type { JSX } from "react"
import { assertNever, formatSize } from "@some-ui/core-utils"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { CircleCheck, CircleMinus, CloudOff, ReceiptText } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import type { DeleteSheet, Receipt } from "@/lib/my-data"
import { retryable } from "@/lib/my-data/deleting"
import {
  DELETING,
  itemName,
  receiptKind,
  receiptParts,
} from "@/lib/my-data/words"

const BIG = "h-12 rounded-2xl text-base"

/** One receipt's facts: what, when, what went and what stayed. */
const ReceiptFacts = ({ receipt }: { receipt: Receipt }): JSX.Element => {
  const facts: ReadonlyArray<readonly [string, string]> = [
    [DELETING.receipt.what, receiptKind(receipt.of)],
    [DELETING.receipt.recorded, itemName(receipt.recordedAt)],
    [DELETING.receipt.size, formatSize(receipt.size)],
    [DELETING.receipt.deleted, itemName(receipt.deletedAt)],
    [DELETING.receipt.went, receiptParts(receipt.went)],
    [DELETING.receipt.stayed, receiptParts(receipt.stayed)],
  ]
  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <ReceiptText className="size-4" aria-hidden />
        {DELETING.receipt.title}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {facts.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="min-w-0 break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const Lines = ({
  title,
  lines,
  tone,
}: {
  title: string
  lines: ReadonlyArray<string>
  tone: "goes" | "stays"
}): JSX.Element => (
  <div
    className={`space-y-2.5 rounded-2xl p-4 text-sm ${tone === "goes" ? "bg-destructive/10" : "bg-card border"}`}
  >
    <p
      className={`text-xs font-bold tracking-wide uppercase ${tone === "goes" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {title}
    </p>
    <ul className="space-y-2.5">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2.5">
          {tone === "goes" ? (
            <CircleMinus
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden
            />
          ) : (
            <CircleCheck
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden
            />
          )}
          <span>{line}</span>
        </li>
      ))}
    </ul>
  </div>
)

/** What the sheet says once home answered, or didn't. */
function endedLines(sheet: Extract<DeleteSheet, { kind: "ended" }>): {
  title: string
  lines: ReadonlyArray<string>
} {
  const n = sheet.ids.length
  const { end } = sheet
  switch (end.kind) {
    case "unpaired": {
      return { title: DELETING.nothing, lines: [DELETING.unpaired] }
    }
    case "busy": {
      return { title: DELETING.nothing, lines: [DELETING.busy] }
    }
    case "unreachable": {
      return { title: DELETING.nothing, lines: [DELETING.unreachable(n)] }
    }
    case "answered": {
      const lines: Array<string> = []
      if (end.letGo === "letting") lines.push(DELETING.letting)
      if (end.letGo === "failed") lines.push(DELETING.letFailed)
      if (end.kept > 0) lines.push(DELETING.kept(end.kept, n))
      if (end.notHeld > 0) lines.push(DELETING.notHeld(end.notHeld, n))
      if (end.forgotten > 0) lines.push(DELETING.forgotten)
      if (end.unanswered.length > 0)
        lines.push(DELETING.unanswered(end.unanswered.length, n))
      return {
        title:
          end.gone.length === 0
            ? DELETING.nothing
            : DELETING.gone(end.gone.length),
        lines,
      }
    }
    default: {
      return assertNever(end)
    }
  }
}

export const DeleteSheetView = ({
  sheet,
  onConfirm,
  onClose,
}: {
  sheet: DeleteSheet
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => {
  const open = sheet.kind !== "closed"
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        side="bottom"
        data-scroll-intent
        className={
          // scroll-intent: one ask read top to bottom, what goes then what stays then the two answers; on a phone held sideways its lists pass the sheet's height
          "max-h-[92dvh] space-y-4 overflow-y-auto rounded-t-3xl px-5 pt-6 pb-8"
        }
      >
        {sheet.kind === "asking" || sheet.kind === "deleting" ? (
          <Asking sheet={sheet} onConfirm={onConfirm} onClose={onClose} />
        ) : null}
        {sheet.kind === "ended" ? (
          <Ended sheet={sheet} onConfirm={onConfirm} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

const Asking = ({
  sheet,
  onConfirm,
  onClose,
}: {
  sheet: Extract<DeleteSheet, { kind: "asking" | "deleting" }>
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => {
  const n = sheet.ids.length
  const deleting = sheet.kind === "deleting"
  return (
    <>
      <SheetHeader className="px-0 text-left">
        <SheetTitle className="text-xl">
          {DELETING.title(sheet.of, n)}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {DELETING.goesTitle}
        </SheetDescription>
      </SheetHeader>
      <Lines title={DELETING.goesTitle} lines={DELETING.goes(n)} tone="goes" />
      <Lines
        title={DELETING.staysTitle}
        lines={DELETING.stays(n)}
        tone="stays"
      />
      <div className="flex flex-col gap-2.5">
        <Button size="lg" className={BIG} onClick={onClose} disabled={deleting}>
          {DELETING.keep(n)}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className={BIG}
          onClick={onConfirm}
          disabled={deleting}
        >
          {deleting ? DELETING.deleting : DELETING.confirm(n)}
        </Button>
      </div>
    </>
  )
}

const Ended = ({
  sheet,
  onConfirm,
  onClose,
}: {
  sheet: Extract<DeleteSheet, { kind: "ended" }>
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => {
  const { title, lines } = endedLines(sheet)
  const gone = sheet.end.kind === "answered" ? sheet.end.gone : []
  const again = retryable(sheet.ids, sheet.end).length > 0
  return (
    <>
      {gone.length === 0 ? (
        <CloudOff className="text-destructive size-8" aria-hidden />
      ) : (
        <CircleCheck className="size-8 text-emerald-600" aria-hidden />
      )}
      <SheetHeader className="px-0 text-left">
        <SheetTitle className="text-xl">{title}</SheetTitle>
        <SheetDescription className="text-base" role="status">
          {lines.join(" ")}
        </SheetDescription>
      </SheetHeader>
      {gone.map((receipt) => (
        <ReceiptFacts key={receipt.id} receipt={receipt} />
      ))}
      {gone.length > 0 ? (
        <p className="text-muted-foreground text-xs">{DELETING.receipt.kept}</p>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <Button size="lg" className={BIG} onClick={onClose}>
          {gone.length === 0 ? DELETING.keep(sheet.ids.length) : DELETING.done}
        </Button>
        {again ? (
          <Button
            variant="outline"
            size="lg"
            className={BIG}
            onClick={onConfirm}
          >
            {DELETING.tryAgain}
          </Button>
        ) : null}
        {gone.length > 0 && hasAudience("apk") ? (
          <Button variant="outline" size="lg" className={BIG} asChild>
            <Link to="/settings/data/deleted" onClick={onClose}>
              {DELETING.allReceipts}
            </Link>
          </Button>
        ) : null}
      </div>
    </>
  )
}

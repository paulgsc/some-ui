/**
 * My data's page for the weekly call's videos (ST38, #2661): each week home
 * holds, newest first, and what of it can be let go. A week's video is
 * offered once its YouTube link is saved (Studio's Calls), and the rest of
 * its folder once the video went; each step asks once in a sheet that says
 * what goes and what stays, "Keep it" first, and ends on home's receipt.
 * The weeks are `lib/call-videos`' list; the step is `lib/my-data`'s
 * `phoneCallDeleting`; every word is `CALL_DELETING`. Phone build only.
 *
 * LA19 (docs/learner-data-authority.md): `confirm` is called only from the
 * sheet's "Delete for good" and Try again.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"

import { callsRefresher, callVideos } from "@/lib/call-videos"
import type { Week } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import { phoneCallDeleting } from "@/lib/my-data"
import type { CallAsk, CallSheet } from "@/lib/my-data/call-deleting"
import type { CallDeleting } from "@/lib/my-data/call-deleting-runtime"
import { CALL_DELETING, DELETING, itemName } from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

const WORDS = CALL_DELETING
const BIG = "h-12 rounded-2xl text-base"

/** What of a week can be let go now, if anything. */
function offer(week: Week): CallAsk | null {
  const went = (step: "video" | "rest"): boolean =>
    week.receipts.some((receipt) => receipt.step === step)
  if (week.link === null) return null
  if (!went("video") && week.videoBytes !== null) {
    return {
      from: week.from,
      to: week.to,
      step: "video",
      bytes: week.videoBytes,
    }
  }
  if (went("video") && !went("rest") && week.restBytes !== null) {
    return { from: week.from, to: week.to, step: "rest", bytes: week.restBytes }
  }
  return null
}

const WeekRow = ({
  week,
  deleting,
}: {
  week: Week
  deleting: CallDeleting
}): JSX.Element => {
  const ask = offer(week)
  const stands = standing(week)
  const allGone = week.receipts.some((receipt) => receipt.step === "rest")
  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-3">
      <span className="text-sm font-medium">
        {WORDS.week(week.from, week.to)}
      </span>
      {stands === "waiting" && !allGone && (
        <span className="text-muted-foreground text-xs">{WORDS.waiting}</span>
      )}
      {stands === "kept" && week.link === null && (
        <span className="text-muted-foreground text-xs">{WORDS.noLink}</span>
      )}
      {allGone && (
        <span className="text-muted-foreground text-xs">{WORDS.allGone}</span>
      )}
      {ask !== null && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => deleting.ask(ask)}
        >
          {ask.step === "video"
            ? WORDS.video(formatSize(ask.bytes))
            : WORDS.rest(formatSize(ask.bytes))}
        </Button>
      )}
    </li>
  )
}

const Asking = ({
  sheet,
  onConfirm,
  onClose,
}: {
  sheet: Extract<CallSheet, { kind: "asking" | "deleting" }>
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => {
  const { ask } = sheet
  const deleting = sheet.kind === "deleting"
  const size = formatSize(ask.bytes)
  return (
    <>
      <SheetHeader className="px-0 text-left">
        <SheetTitle className="text-xl">{WORDS.asks[ask.step]}</SheetTitle>
        <SheetDescription>{WORDS.week(ask.from, ask.to)}</SheetDescription>
      </SheetHeader>
      <div className="space-y-1">
        <p className="text-sm font-medium">{DELETING.goesTitle}</p>
        <p className="text-sm">{WORDS.goes[ask.step](size)}</p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{DELETING.staysTitle}</p>
        <p className="text-sm">{WORDS.stays}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button size="lg" className={BIG} onClick={onClose} disabled={deleting}>
          {WORDS.keep}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className={BIG}
          onClick={onConfirm}
          disabled={deleting}
        >
          {deleting ? WORDS.deleting : WORDS.confirm}
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
  sheet: Extract<CallSheet, { kind: "ended" }>
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => {
  const { end } = sheet
  const line =
    end.kind === "gone"
      ? WORDS.gone(itemName(end.receipt.deletedAt))
      : WORDS[end.kind]
  return (
    <>
      <SheetHeader className="px-0 text-left">
        <SheetTitle className="text-xl">
          {WORDS.asks[sheet.ask.step]}
        </SheetTitle>
        <SheetDescription>{line}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-2.5">
        {end.kind === "away" && (
          <Button size="lg" className={BIG} onClick={onConfirm}>
            {WORDS.tryAgain}
          </Button>
        )}
        <Button variant="outline" size="lg" className={BIG} onClick={onClose}>
          {WORDS.done}
        </Button>
      </div>
    </>
  )
}

const CallSheetView = ({
  sheet,
  onConfirm,
  onClose,
}: {
  sheet: CallSheet
  onConfirm: () => void
  onClose: () => void
}): JSX.Element => (
  <Sheet
    open={sheet.kind !== "closed"}
    onOpenChange={(next) => {
      if (!next) onClose()
    }}
  >
    <SheetContent
      side="bottom"
      data-scroll-intent
      className={
        // scroll-intent: one ask read top to bottom, what goes then what stays then the two answers; on a phone held sideways it passes the sheet's height
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

/** My data's call videos page, read on mount and on a drag down. */
export const DeviceMyDataCalls = (): JSX.Element => {
  const calls = callVideos()
  const deleting = phoneCallDeleting()
  const { list } = useSyncExternalStore(calls.subscribe, calls.getSnapshot)
  const sheet = useSyncExternalStore(deleting.subscribe, deleting.getSnapshot)
  useEffect(() => {
    void calls.open()
    return screenRefreshers.register(callsRefresher)
  }, [calls])
  return (
    <>
      <div className="space-y-1">
        <Link
          to="/settings/data"
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {WORDS.back}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{WORDS.title}</h1>
      </div>
      <p className="text-muted-foreground text-sm">{WORDS.lead}</p>
      {list.kind === "read" && (
        <ul className="flex flex-col gap-2">
          {list.weeks.map((week) => (
            <WeekRow key={week.from} week={week} deleting={deleting} />
          ))}
        </ul>
      )}
      <CallSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

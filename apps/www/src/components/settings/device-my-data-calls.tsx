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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"

import { callsRefresher, callVideos } from "@/lib/call-videos"
import type { Week } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import { phoneCallDeleting } from "@/lib/my-data"
import type { CallAsk, CallSheet } from "@/lib/my-data/call-deleting"
import type { CallDeleting } from "@/lib/my-data/call-deleting-runtime"
import { CALL_DELETING, DELETING, itemName } from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { CallWeeksList } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import { MyDataHeading } from "@/components/settings/device-my-data"
import { BIG, MyDataSheet } from "@/components/settings/device-my-data-delete"

const WORDS = CALL_DELETING

/** Whether the week's rest went too: nothing of it is left on home. */
const allGone = (week: Week): boolean =>
  week.receipts.some((receipt) => receipt.step === "rest")

/** What of a week can be let go now, if anything. */
function offer(week: Week): CallAsk | null {
  if (week.link === null) return null
  const videoWent = standing(week) === "letGo"
  if (!videoWent && week.videoBytes !== null) {
    return {
      from: week.from,
      to: week.to,
      step: "video",
      bytes: week.videoBytes,
    }
  }
  if (videoWent && !allGone(week) && week.restBytes !== null) {
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
  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-3">
      <span className="text-sm font-medium">
        {WORDS.week(week.from, week.to)}
      </span>
      {stands === "waiting" && (
        <span className="text-muted-foreground text-xs">{WORDS.waiting}</span>
      )}
      {stands === "kept" && week.link === null && (
        <span className="text-muted-foreground text-xs">{WORDS.noLink}</span>
      )}
      {allGone(week) && (
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
          {DELETING.keep(1)}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className={BIG}
          onClick={onConfirm}
          disabled={deleting}
        >
          {deleting ? DELETING.deleting : DELETING.confirm(1)}
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
        {end.kind === "unanswered" && (
          <Button size="lg" className={BIG} onClick={onConfirm}>
            {DELETING.tryAgain}
          </Button>
        )}
        <Button variant="outline" size="lg" className={BIG} onClick={onClose}>
          {DELETING.done}
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
  <MyDataSheet open={sheet.kind !== "closed"} onClose={onClose}>
    {sheet.kind === "asking" || sheet.kind === "deleting" ? (
      <Asking sheet={sheet} onConfirm={onConfirm} onClose={onClose} />
    ) : null}
    {sheet.kind === "ended" ? (
      <Ended sheet={sheet} onConfirm={onConfirm} onClose={onClose} />
    ) : null}
  </MyDataSheet>
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
      <MyDataHeading title={WORDS.title} />
      <p className="text-muted-foreground text-sm">{WORDS.lead}</p>
      <CallWeeksList
        list={list}
        pair={<PairHomeLink>{WORDS.pair}</PairHomeLink>}
        onTryAgain={() => void calls.open()}
      >
        {list.kind === "read" && (
          <ul className="flex flex-col gap-2">
            {list.weeks.map((week) => (
              <WeekRow key={week.from} week={week} deleting={deleting} />
            ))}
          </ul>
        )}
      </CallWeeksList>
      <CallSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

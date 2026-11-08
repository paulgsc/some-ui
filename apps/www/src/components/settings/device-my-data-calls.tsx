/**
 * My data's page for each feed's videos (`FEEDS`; ST38, #2661; FEED4): each
 * episode home holds, newest first, and what of it can be let go. An
 * episode's video is offered once its YouTube link is saved (Studio's feed
 * videos), and the rest of its folder once the video went; each step asks
 * once in a sheet that says what goes and what stays, "Keep it" first, and
 * ends on home's receipt. Each feed's episodes are
 * `lib/call-videos`' list of it; the step, for every feed, is
 * `lib/my-data`'s one `phoneCallDeleting`; every word is `CALL_DELETING` and
 * the feed's `FEED_WORDS`. Phone build only.
 *
 * LA19 (docs/learner-data-authority.md): `confirm` is called only from the
 * sheet's "Delete for good" and Try again.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import {
  Button,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"

import type { Feed } from "@/lib/call-videos"
import { FEED_WORDS, FEEDS } from "@/lib/call-videos"
import type { Episode } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import { phoneCallDeleting } from "@/lib/my-data"
import type { CallAsk, CallSheet } from "@/lib/my-data/call-deleting"
import type { CallDeleting } from "@/lib/my-data/call-deleting-runtime"
import { CALL_DELETING, DELETING, itemName } from "@/lib/my-data/words"
import { EpisodesList, useFeedVideos } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import { MyDataHeading } from "@/components/settings/device-my-data"
import { BIG, MyDataSheet } from "@/components/settings/device-my-data-delete"

const WORDS = CALL_DELETING

/** Whether the episode's rest went too: nothing of it is left on home. */
const allGone = (episode: Episode): boolean =>
  episode.receipts.some((receipt) => receipt.step === "rest")

/** What of a feed's episode can be let go now, if anything. */
function offer(feed: Feed, episode: Episode): CallAsk | null {
  if (episode.link === null) return null
  const { key } = episode
  const videoWent = standing(episode) === "letGo"
  if (!videoWent && episode.videoBytes !== null) {
    return { feed, key, step: "video", bytes: episode.videoBytes }
  }
  if (videoWent && !allGone(episode) && episode.restBytes !== null) {
    return { feed, key, step: "rest", bytes: episode.restBytes }
  }
  return null
}

const EpisodeRow = ({
  feed,
  episode,
  deleting,
}: {
  feed: Feed
  episode: Episode
  deleting: CallDeleting
}): JSX.Element => {
  const ask = offer(feed, episode)
  const stands = standing(episode)
  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-3">
      <span className="text-sm font-medium">
        {FEED_WORDS[feed].label(episode.key)}
      </span>
      {stands === "waiting" && (
        <span className="text-muted-foreground text-xs">
          {FEED_WORDS[feed].waiting}
        </span>
      )}
      {stands === "kept" && episode.link === null && (
        <span className="text-muted-foreground text-xs">{WORDS.noLink}</span>
      )}
      {allGone(episode) && (
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
        <SheetDescription>{WORDS.episode(ask.feed, ask.key)}</SheetDescription>
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

/** One feed's episodes on My data's page, read on mount and on a drag down. */
const FeedSection = ({
  feed,
  deleting,
}: {
  feed: Feed
  deleting: CallDeleting
}): JSX.Element => {
  const { videos, state } = useFeedVideos(feed)
  const { list } = state
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{FEED_WORDS[feed].heading}</h2>
      <EpisodesList
        feed={feed}
        list={list}
        pair={<PairHomeLink>{WORDS.pair}</PairHomeLink>}
        onTryAgain={() => void videos.open()}
      >
        {list.kind === "read" && (
          <ul className="flex flex-col gap-2">
            {list.episodes.map((episode) => (
              <EpisodeRow
                key={episode.key}
                feed={feed}
                episode={episode}
                deleting={deleting}
              />
            ))}
          </ul>
        )}
      </EpisodesList>
    </section>
  )
}

/** My data's page for each feed's videos, a section a feed and one sheet. */
export const DeviceMyDataCalls = (): JSX.Element => {
  const deleting = phoneCallDeleting()
  const sheet = useSyncExternalStore(deleting.subscribe, deleting.getSnapshot)
  return (
    <>
      <MyDataHeading title={WORDS.title} />
      <p className="text-muted-foreground text-sm">{WORDS.lead}</p>
      {FEEDS.map((feed) => (
        <FeedSection key={feed} feed={feed} deleting={deleting} />
      ))}
      <CallSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

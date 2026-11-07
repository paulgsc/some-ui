/**
 * Studio's Calls (ST38, #2661): the weekly call's videos home has made, newest
 * week first. For each, Watch brings the video to the phone and plays it,
 * Share to YouTube hands it to the share sheet, and its YouTube link is saved
 * with the week; once home's copy is let go (My data), the link is how it is
 * watched. Reads `lib/call-videos`' snapshot and says what was pressed; every
 * word is its `CALLS_WORDS`. Phone build only.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, formatSize } from "@some-ui/core-utils"
import { Button, Input, Notice } from "@some-ui/shared"

import type { CallVideos } from "@/lib/call-videos"
import { CALLS_WORDS, callsRefresher, callVideos } from "@/lib/call-videos"
import type { Fetch, LinkSave, ListState, Week } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

const WORDS = CALLS_WORDS

const Watching = ({
  week,
  fetch,
  calls,
}: {
  week: Week
  fetch: Fetch | undefined
  calls: CallVideos
}): JSX.Element => {
  if (fetch?.kind === "ready") {
    return (
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the call's words are drawn on screen in every scene, and home makes no caption file */}
        <video
          src={fetch.src}
          controls
          playsInline
          className="w-full rounded-lg"
        />
        <Button size="sm" onClick={() => void calls.share(week.from)}>
          {WORDS.share}
        </Button>
      </div>
    )
  }
  if (fetch?.kind === "fetching") {
    return (
      <p className="text-muted-foreground text-sm">
        {WORDS.bringing(fetch.done, fetch.total)}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {fetch?.kind === "failed" && (
        <p className="text-muted-foreground text-sm">
          {WORDS.failed[fetch.why]}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => void calls.watch(week.from)}
      >
        {WORDS.watch}
        {week.videoBytes === null ? "" : ` (${formatSize(week.videoBytes)})`}
      </Button>
    </div>
  )
}

const LinkField = ({
  week,
  save,
  calls,
}: {
  week: Week
  save: LinkSave | undefined
  calls: CallVideos
}): JSX.Element => {
  const [pasted, setPasted] = useState("")
  const saving = save?.kind === "saving"
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        void calls.saveLink(week.from, pasted)
      }}
    >
      <label className="text-sm font-medium" htmlFor={`link-${week.from}`}>
        {WORDS.linkLabel}
      </label>
      <Input
        id={`link-${week.from}`}
        inputMode="url"
        placeholder={WORDS.linkHint}
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
      />
      {save?.kind === "notAVideo" && (
        <p className="text-destructive text-sm">{WORDS.notAVideo}</p>
      )}
      {save?.kind === "away" && (
        <p className="text-destructive text-sm">{WORDS.linkAway}</p>
      )}
      <Button size="sm" type="submit" disabled={saving || pasted.trim() === ""}>
        {saving ? WORDS.saving : WORDS.save}
      </Button>
    </form>
  )
}

const WeekRow = ({
  week,
  fetch,
  save,
  calls,
}: {
  week: Week
  fetch: Fetch | undefined
  save: LinkSave | undefined
  calls: CallVideos
}): JSX.Element => {
  const stands = standing(week)
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="font-medium">{WORDS.week(week.from, week.to)}</h2>
      {stands === "waiting" && (
        <p className="text-muted-foreground text-sm">{WORDS.waiting}</p>
      )}
      {stands === "kept" && (
        <Watching week={week} fetch={fetch} calls={calls} />
      )}
      {stands === "letGo" && (
        <p className="text-muted-foreground text-sm">{WORDS.letGo}</p>
      )}
      {week.link !== null && (
        <a
          href={week.link.url}
          className="self-start text-sm underline underline-offset-4"
        >
          {WORDS.onYouTube}
        </a>
      )}
      {stands === "kept" && <LinkField week={week} save={save} calls={calls} />}
    </li>
  )
}

/**
 * Home's list of weeks as it stands: what it says while reading, unpaired,
 * unanswered or empty, and its children once there are weeks. Studio's Calls and
 * My data's call videos both draw it.
 */
export const CallWeeksList = ({
  list,
  pair,
  onTryAgain,
  children,
}: {
  list: ListState
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
  onTryAgain: () => void
  /** The weeks, drawn by the caller from `list`. */
  children: ReactNode
}): JSX.Element | null => {
  switch (list.kind) {
    case "reading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "unpaired": {
      return (
        <>
          <p className="text-sm">{WORDS.unpaired}</p>
          {pair}
        </>
      )
    }
    case "away":
    case "older":
    case "unreadable": {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{WORDS[list.kind]}</p>
          <Button size="sm" variant="outline" onClick={onTryAgain}>
            {WORDS.tryAgain}
          </Button>
        </div>
      )
    }
    case "read": {
      return list.weeks.length === 0 ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <>{children}</>
      )
    }
    default: {
      return assertNever(list)
    }
  }
}

export const CallVideosScreen = ({
  pair,
}: {
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
}): JSX.Element => {
  const calls = callVideos()
  const state = useSyncExternalStore(calls.subscribe, calls.getSnapshot)
  useEffect(() => {
    void calls.open()
    return screenRefreshers.register(callsRefresher)
  }, [calls])
  const { list, said } = state
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{WORDS.intro}</p>
      {said !== null && (
        <Notice
          key={`${said.kind}-${said.from}`}
          onDismiss={() => calls.seen()}
        >
          {said.kind === "linkSaved" ? WORDS.linkSaved : WORDS.shareFailed}
        </Notice>
      )}
      <CallWeeksList
        list={list}
        pair={pair}
        onTryAgain={() => void calls.open()}
      >
        {list.kind === "read" && (
          <ul className="flex flex-col gap-3">
            {list.weeks.map((week) => (
              <WeekRow
                key={week.from}
                week={week}
                fetch={state.fetches[week.from]}
                save={state.links[week.from]}
                calls={calls}
              />
            ))}
          </ul>
        )}
      </CallWeeksList>
    </div>
  )
}

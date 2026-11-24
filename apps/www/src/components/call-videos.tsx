/**
 * Studio's feed videos (ST38, #2661; FEED4): the episodes home has made of
 * each feed (`FEEDS`), newest first, each on its own page under Studio's
 * Episodes (SFEED1, `EpisodeScreen`). On it, Watch brings the video to the
 * phone and plays it, Share to YouTube hands it to the share sheet, and its
 * YouTube link is saved with the episode where its feed takes one
 * (`LINKED_FEEDS`), beside the files its render left for the upload, its
 * thumbnail and its chapters (`EpisodeFiles`, ASSETS-R; SFEED4); once home's copy is let go (My data,
 * `LET_GO_FEEDS`),
 * the link is how it is watched. Reads `lib/call-videos`' snapshot of
 * the feed (`useFeedVideos`) and says what was pressed; every word is its
 * `VIDEOS_WORDS` and `FEED_WORDS`. Phone build only.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { assertNever, formatSize } from "@some-ui/core-utils"
import { Button, Input, Notice, Reading } from "@some-ui/shared"

import type { Feed, FeedVideos } from "@/lib/call-videos"
import {
  episodeName,
  FEED_WORDS,
  feedVideos,
  VIDEOS_WORDS,
  videosRefresher,
} from "@/lib/call-videos"
import type {
  Episode,
  Fetch,
  LinkSave,
  ListState,
  VideosState,
} from "@/lib/call-videos/model"
import { homeBytes, listedEpisode, standing } from "@/lib/call-videos/model"
import { isLinked } from "@/lib/feeds"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { EpisodeFiles } from "@/components/episode-files"
import { EpisodeNote } from "@/components/studio/episode-feedback"
import { VideoFetch } from "@/components/video-fetch"

const WORDS = VIDEOS_WORDS

/**
 * `src` starting at `ms`, by a media fragment (`#t=`), so the player opens
 * there with no seek of ours to time.
 */
const atMoment = (src: string, ms: number): string =>
  `${src}#t=${String(Math.floor(ms / 1000))}`

const Watching = ({
  feed,
  episode,
  fetch,
  videos,
  startAt,
}: {
  feed: Feed
  episode: Episode
  fetch: Fetch | undefined
  videos: FeedVideos
  /** Where the video starts, from its start: a note's moment (TAKES2). */
  startAt?: number | undefined
}): JSX.Element => {
  const video = useRef<HTMLVideoElement>(null)
  if (fetch?.kind === "ready") {
    return (
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the words are drawn on screen (the call's in every scene, Playoff Delta's where its shape draws captions), and home makes no caption file */}
        <video
          ref={video}
          src={startAt === undefined ? fetch.src : atMoment(fetch.src, startAt)}
          controls
          playsInline
          className="w-full rounded-lg"
        />
        <Button size="sm" onClick={() => void videos.share(episode.key)}>
          {WORDS.share}
        </Button>
        <EpisodeNote feed={feed} episode={episode.key} video={video} />
      </div>
    )
  }
  return (
    <VideoFetch
      fetch={fetch}
      bytes={episode.videoBytes}
      onWatch={() => void videos.watch(episode.key)}
    />
  )
}

const LinkField = ({
  episode,
  save,
  videos,
}: {
  episode: Episode
  save: LinkSave | undefined
  videos: FeedVideos
}): JSX.Element => {
  const [pasted, setPasted] = useState("")
  const saving = save?.kind === "saving"
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        void videos.saveLink(episode.key, pasted)
      }}
    >
      <label className="text-sm font-medium" htmlFor={`link-${episode.key}`}>
        {WORDS.linkLabel}
      </label>
      <Input
        id={`link-${episode.key}`}
        inputMode="url"
        placeholder={WORDS.linkHint}
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
      />
      {save?.kind === "notAVideo" && (
        <p className="text-destructive text-sm">{WORDS.notAVideo}</p>
      )}
      {save?.kind === "older" && (
        <p className="text-destructive text-sm">{WORDS.linkOlder}</p>
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

const EpisodeRow = ({
  feed,
  episode,
  fetch,
  save,
  videos,
  startAt,
}: {
  feed: Feed
  episode: Episode
  fetch: Fetch | undefined
  save: LinkSave | undefined
  videos: FeedVideos
  startAt?: number | undefined
}): JSX.Element => {
  const stands = standing(episode)
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="font-medium">{episodeName(feed, episode)}</h2>
      {stands === "waiting" && (
        <p className="text-muted-foreground text-sm">
          {FEED_WORDS[feed].waiting}
        </p>
      )}
      {stands === "kept" && (
        <Watching
          feed={feed}
          episode={episode}
          fetch={fetch}
          videos={videos}
          startAt={startAt}
        />
      )}
      {stands === "letGo" && (
        <p className="text-muted-foreground text-sm">
          {FEED_WORDS[feed].letGo}
        </p>
      )}
      {episode.link !== null && (
        <a
          href={episode.link.url}
          className="self-start text-sm underline underline-offset-4"
        >
          {WORDS.onYouTube}
        </a>
      )}
      {stands === "kept" && isLinked(feed) && (
        <LinkField episode={episode} save={save} videos={videos} />
      )}
    </li>
  )
}

/**
 * `feed`'s videos and their snapshot: the list is read on mount, and again on
 * a drag down while the caller is on screen.
 */
export function useFeedVideos(feed: Feed): {
  videos: FeedVideos
  state: VideosState
} {
  const videos = feedVideos(feed)
  const state = useSyncExternalStore(videos.subscribe, videos.getSnapshot)
  useEffect(() => {
    void videos.open()
    return screenRefreshers.register(videosRefresher(feed))
  }, [videos, feed])
  return { videos, state }
}

/**
 * Home's list of a feed's episodes as it stands: what it says while reading,
 * unpaired, unanswered or empty, and its children once there are episodes,
 * after the feed's `voice` line when its episodes hold the owner's voice.
 */
export const EpisodesList = ({
  feed,
  list,
  pair,
  onTryAgain,
  children,
}: {
  feed: Feed
  list: ListState
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
  onTryAgain: () => void
  /** The episodes, drawn by the caller from `list`. */
  children: ReactNode
}): JSX.Element | null => {
  switch (list.kind) {
    case "reading": {
      return <Reading>{WORDS.reading}</Reading>
    }
    case "unpaired": {
      return (
        <>
          <p className="text-sm">{FEED_WORDS[feed].unpaired}</p>
          {pair}
        </>
      )
    }
    case "away":
    case "busy":
    case "older":
    case "unreadable": {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {list.kind === "older" ? FEED_WORDS[feed].older : WORDS[list.kind]}
          </p>
          <Button size="sm" variant="outline" onClick={onTryAgain}>
            {WORDS.tryAgain}
          </Button>
        </div>
      )
    }
    case "read": {
      const { none, voice } = FEED_WORDS[feed]
      return list.episodes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{none}</p>
      ) : (
        <>
          {voice !== null && <p className="text-sm font-medium">{voice}</p>}
          {children}
        </>
      )
    }
    default: {
      return assertNever(list)
    }
  }
}

/**
 * One episode of `feed` (SFEED1's episode page): its video to watch, share to
 * YouTube and save the link of, as home's list has it now, or what the list
 * says while it can't show it.
 */
export const EpisodeScreen = ({
  feed,
  episodeKey,
  pair,
  startAt,
}: {
  feed: Feed
  episodeKey: string
  /** Where its video starts, from its start (a note's moment, TAKES2). */
  startAt?: number | undefined
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
}): JSX.Element => {
  const { videos, state } = useFeedVideos(feed)
  const { list, said } = state
  const episode = listedEpisode(list, episodeKey)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{FEED_WORDS[feed].intro}</p>
      {said !== null && said.key === episodeKey && (
        <Notice
          key={`${said.kind}-${said.key}`}
          onDismiss={() => videos.seen()}
        >
          {said.kind === "linkSaved"
            ? FEED_WORDS[feed].linkSaved
            : WORDS.shareFailed}
        </Notice>
      )}
      <EpisodesList
        feed={feed}
        list={list}
        pair={pair}
        onTryAgain={() => void videos.open()}
      >
        {episode === null ? (
          <p className="text-muted-foreground text-sm">
            {FEED_WORDS[feed].gone}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              <EpisodeRow
                feed={feed}
                episode={episode}
                fetch={state.fetches[episode.key]}
                save={state.links[episode.key]}
                videos={videos}
                startAt={startAt}
              />
            </ul>
            <EpisodeFiles key={episode.key} feed={feed} episode={episode} />
          </>
        )}
      </EpisodesList>
    </div>
  )
}

/**
 * What home holds of `feed`'s episodes, by size (SFEED8, #2748), as a line
 * of its feed's "Where it's kept", once its list is read and home holds any.
 * It reads the list the feed's episodes on the same page open, and asks for
 * none itself.
 */
export const FeedHomeSize = ({
  feed,
  label,
}: {
  feed: Feed
  /** What comes before the size. */
  label: string
}): JSX.Element | null => {
  const videos = feedVideos(feed)
  const { list } = useSyncExternalStore(videos.subscribe, videos.getSnapshot)
  const bytes = list.kind === "read" ? homeBytes(list.episodes) : null
  return bytes === null ? null : (
    <dd className="text-sm">
      {label} {formatSize(bytes)}
    </dd>
  )
}

/**
 * Studio's feed videos (ST38, #2661; FEED4): the episodes home has made of
 * each feed (`FEEDS`), newest first, each on its own page under Studio's
 * Episodes (SFEED1, `EpisodeScreen`). On it, Watch brings the video to the
 * phone and plays it, Share to YouTube hands it to the share sheet, and its
 * YouTube link is saved with the episode, beside its chapters to copy into
 * the upload's description (SFEED4); once home's copy is let go (My data),
 * the link is how it is watched. Reads `lib/call-videos`' snapshot of
 * the feed (`useFeedVideos`) and says what was pressed; every word is its
 * `VIDEOS_WORDS` and `FEED_WORDS`. Phone build only.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { assertNever, formatSize } from "@some-ui/core-utils"
import { Button, Input, Notice } from "@some-ui/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { Feed, FeedVideos } from "@/lib/call-videos"
import {
  episodeChapters,
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
import { homeBytes, standing } from "@/lib/call-videos/model"
import { isNoted } from "@/lib/feeds"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { CopyButton } from "@/components/copy-button"
import { EpisodeNote } from "@/components/studio/episode-feedback"
import { TILE, TileBody } from "@/components/studio/layout"
import { VideoFetch } from "@/components/video-fetch"

const WORDS = VIDEOS_WORDS

const Watching = ({
  feed,
  episode,
  fetch,
  videos,
}: {
  feed: Feed
  episode: Episode
  fetch: Fetch | undefined
  videos: FeedVideos
}): JSX.Element => {
  const video = useRef<HTMLVideoElement>(null)
  if (fetch?.kind === "ready") {
    return (
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the words are drawn on screen (the call's in every scene, Playoff Delta's where its shape draws captions), and home makes no caption file */}
        <video
          ref={video}
          src={fetch.src}
          controls
          playsInline
          className="w-full rounded-lg"
        />
        <Button size="sm" onClick={() => void videos.share(episode.key)}>
          {WORDS.share}
        </Button>
        {/* Home keeps no note on an essay: its week was answered by voice. */}
        {isNoted(feed) && (
          <EpisodeNote feed={feed} episode={episode.key} video={video} />
        )}
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
}: {
  feed: Feed
  episode: Episode
  fetch: Fetch | undefined
  save: LinkSave | undefined
  videos: FeedVideos
}): JSX.Element => {
  const stands = standing(episode)
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="font-medium">{FEED_WORDS[feed].label(episode.key)}</h2>
      {stands === "waiting" && (
        <p className="text-muted-foreground text-sm">
          {FEED_WORDS[feed].waiting}
        </p>
      )}
      {stands === "kept" && (
        <Watching feed={feed} episode={episode} fetch={fetch} videos={videos} />
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
      {stands === "kept" && (
        <LinkField episode={episode} save={save} videos={videos} />
      )}
    </li>
  )
}

/** An episode's chapters with the way to copy them, once home has some. */
const Chapters = ({
  feed,
  episodeKey,
}: {
  feed: Feed
  episodeKey: string
}): JSX.Element | null => {
  // Read each time the page opens (the app's default is not to), so chapters
  // home made since, or an answer home couldn't give before, show.
  const { data } = useQuery({
    queryKey: ["feeds", feed, "chapters", episodeKey],
    queryFn: ({ signal }) =>
      episodeChapters(feed, episodeKey, () => !signal.aborted),
    refetchOnMount: "always",
    retry: false,
  })
  if (data?.kind !== "lines") return null
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">{WORDS.chapters}</h2>
      <p className="text-muted-foreground text-xs">{WORDS.chaptersLine}</p>
      <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs whitespace-pre-wrap">
        {data.text}
      </pre>
      <CopyButton text={data.text} what={WORDS.chaptersWhat} />
    </section>
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
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
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
          {/* Wherever an episode holding the owner's voice is listed, it says so (#2692). */}
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
 * `feed`'s episodes as links to each one's page (SFEED1's Episodes list),
 * newest first, as home's list has them, or what the list says while it
 * can't show them.
 */
export const FeedEpisodeLinks = ({
  feed,
  pair,
}: {
  feed: Feed
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
}): JSX.Element => {
  const { videos, state } = useFeedVideos(feed)
  const { list } = state
  return (
    <EpisodesList
      feed={feed}
      list={list}
      pair={pair}
      onTryAgain={() => void videos.open()}
    >
      {/* An episode's page is the phone's ("apk"), as this list is (A3). */}
      {list.kind === "read" && hasAudience("apk") && (
        <ul className="flex flex-col gap-2">
          {list.episodes.map((episode) => (
            <li key={episode.key}>
              <Link
                to="/journal/episodes/$feed/$key"
                params={{ feed, key: episode.key }}
                className={TILE}
              >
                <TileBody title={FEED_WORDS[feed].label(episode.key)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </EpisodesList>
  )
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
  gone,
}: {
  feed: Feed
  episodeKey: string
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
  /** What to say when home's list no longer has the episode. */
  gone: string
}): JSX.Element => {
  const { videos, state } = useFeedVideos(feed)
  const { list, said } = state
  const episode =
    list.kind === "read"
      ? list.episodes.find((one) => one.key === episodeKey)
      : undefined
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
        {episode === undefined ? (
          <p className="text-muted-foreground text-sm">{gone}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              <EpisodeRow
                feed={feed}
                episode={episode}
                fetch={state.fetches[episode.key]}
                save={state.links[episode.key]}
                videos={videos}
              />
            </ul>
            <Chapters feed={feed} episodeKey={episode.key} />
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

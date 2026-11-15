/**
 * A cards essay's page (CARDS7, #2979): home's video of the essay, which
 * Watch brings to the phone and plays, as a template's preview plays. The
 * essay is a row on Studio › Renders, read from the same board; the video
 * comes from `lib/cards-essay-video`'s runtime, and nothing here lets it go.
 * Sharing it and saving its YouTube link are its episode's page's (Studio's
 * Episodes, `EpisodeScreen`; C389), which this one links to. Phone build only.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { essayName } from "@/lib/cards-essay-key"
import {
  essayOf,
  essayVideo,
  ESSAY_WORDS as WORDS,
} from "@/lib/cards-essay-video"
import type { Essay } from "@/lib/cards-essay-video/model"
import { RENDERS_WORDS, rendersQuery } from "@/lib/renders"
import { VideoFetch } from "@/components/video-fetch"

import { ReadList, StudioPage } from "./layout"

const LINK =
  "text-brand self-start text-sm font-semibold underline underline-offset-4"

const Muted = ({ children }: { children: string }): JSX.Element => (
  <p className="text-muted-foreground text-sm">{children}</p>
)

/** The video, once home has said how big it is. */
const Watching = ({
  essayKey,
  bytes,
}: {
  essayKey: string
  bytes: number
}): JSX.Element => {
  const runtime = essayVideo(essayKey)
  const { fetch } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  useEffect(() => {
    void runtime.look(bytes)
  }, [runtime, bytes])
  if (fetch?.kind === "ready") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- a cards essay is silent: nothing is said to caption
      <video
        src={fetch.src}
        controls
        playsInline
        className="w-full rounded-lg"
      />
    )
  }
  return (
    <VideoFetch
      fetch={fetch}
      bytes={bytes}
      onWatch={() => void runtime.watch(bytes)}
      className="self-start"
    />
  )
}

const Standing = ({
  essayKey,
  essay,
}: {
  essayKey: string
  essay: Essay
}): JSX.Element => {
  if (essay.kind !== "done") {
    return (
      <div className="flex flex-col gap-2">
        <Muted>{essay.kind === "failed" ? WORDS.failed : WORDS.notDone}</Muted>
        {/* Renders is the phone's ("apk"), as this page is (A3). */}
        {hasAudience("apk") && (
          <Link to="/journal/renders" className={LINK}>
            {WORDS.seeRenders}
          </Link>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {essay.bytes === null ? (
        <Muted>{WORDS.noSize}</Muted>
      ) : (
        <Watching essayKey={essayKey} bytes={essay.bytes} />
      )}
      {/* The episode's page is the phone's ("apk"), as this page is (A3). */}
      {hasAudience("apk") && (
        <Link
          to="/journal/episodes/$feed/$key"
          params={{ feed: "cards-essay", key: essayKey }}
          className={LINK}
        >
          {WORDS.toEpisode}
        </Link>
      )}
    </div>
  )
}

export const CardsEssayPage = ({
  essayKey,
}: {
  essayKey: string
}): JSX.Element => (
  <StudioPage heading={essayName(essayKey)} intro={WORDS.intro} back="index">
    <ReadList query={rendersQuery} words={RENDERS_WORDS}>
      {(outcome) =>
        outcome.kind === "read" ? (
          <Standing
            essayKey={essayKey}
            essay={essayOf(outcome.board, essayKey)}
          />
        ) : (
          <Muted>
            {outcome.kind === "unpaired"
              ? RENDERS_WORDS.unpaired
              : RENDERS_WORDS.older}
          </Muted>
        )
      }
    </ReadList>
  </StudioPage>
)

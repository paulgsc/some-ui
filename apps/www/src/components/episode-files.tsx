/**
 * An episode's files beside its video, on its page (ASSETS-R, C1300): one
 * block per file its render leaves for `YouTube` (`SHOWN_ASSETS`), its
 * thumbnail to save and its chapters to copy (SFEED4), or, where home holds
 * none, Generate to ask home to make just that file, the video untouched.
 * The owner uploads to YouTube by hand (C1025): the page keeps the files
 * within reach and calls nothing of YouTube's. Each block reads its own file
 * each time the page opens; what it shows is `assetView`'s, and every word is
 * `ASSET_WORDS`. Phone build only.
 */
import type { JSX } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice, StationStrip } from "@some-ui/shared"
import type { AloneAsset } from "@some-ui/video-render/assets"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { Feed } from "@/lib/call-videos"
import {
  ASSET_WORDS,
  episodeAsset,
  produceAsset,
  readListAgain,
  saveThumbnail,
} from "@/lib/call-videos"
import type {
  AssetContent,
  AssetView,
  ShownAsset,
  Step,
} from "@/lib/call-videos/assets"
import {
  assetView,
  latestStep,
  SHOWN_ASSETS,
  stepUnderWay,
} from "@/lib/call-videos/assets"
import type { Episode } from "@/lib/call-videos/model"
import { FILE_STRIP, fileConveyor } from "@/lib/call-videos/step-conveyor"
import { useAsyncIntent } from "@/lib/intent"
import { CONVEYOR_WORDS } from "@/lib/renders/conveyor"
import { againWhileUnderWay } from "@/lib/renders/model"
import { CopyButton } from "@/components/copy-button"

/**
 * A thumbnail, with Save, which hands it to the share sheet; Save is
 * withdrawn where this build can't share.
 */
const Thumbnail = ({
  feed,
  episodeKey,
  base64,
}: {
  feed: Feed
  episodeKey: string
  base64: string
}): JSX.Element => {
  const save = useAsyncIntent(
    (bytes: string) => saveThumbnail(feed, episodeKey, bytes),
    { presentation: "interactive" }
  )
  const { state } = save
  const saved = state.status === "succeeded" ? state.value : null
  return (
    <>
      {(state.status === "failed" || saved === "failed") && (
        <Notice onDismiss={save.reset}>{ASSET_WORDS.saveFailed}</Notice>
      )}
      <img
        src={`data:image/png;base64,${base64}`}
        alt={ASSET_WORDS.thumbnail.alt}
        className="aspect-video w-full rounded-md"
      />
      {saved !== "unavailable" && (
        <Button
          size="sm"
          className="self-start"
          disabled={state.status === "working"}
          onClick={() => save.start(base64)}
        >
          {ASSET_WORDS.save}
        </Button>
      )}
    </>
  )
}

/** A file's content, with what to do with it. */
const There = ({
  feed,
  episodeKey,
  content,
}: {
  feed: Feed
  episodeKey: string
  content: AssetContent[ShownAsset]
}): JSX.Element =>
  "text" in content ? (
    <>
      <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs whitespace-pre-wrap">
        {content.text}
      </pre>
      <CopyButton text={content.text} what={ASSET_WORDS.description.what} />
    </>
  ) : (
    <Thumbnail feed={feed} episodeKey={episodeKey} base64={content.base64} />
  )

/** Where a file asked of home stands, on the conveyor every render moves along. */
const OnTheLine = ({
  asset,
  step,
}: {
  asset: ShownAsset
  step: Step
}): JSX.Element => {
  const { at, aside, when } = fileConveyor(step)
  const said = when === null ? null : ASSET_WORDS.when[when.kind](when.at)
  return (
    <>
      <StationStrip
        label={ASSET_WORDS.conveyor}
        stations={FILE_STRIP}
        at={at}
        aside={
          aside === null
            ? null
            : {
                name: CONVEYOR_WORDS.asides[aside.aside],
                line: ASSET_WORDS.why[aside.why],
              }
        }
      />
      {aside === null && (
        <p className="text-muted-foreground text-xs">
          {ASSET_WORDS[asset].line}
        </p>
      )}
      {said !== null && <p className="text-xs">{said}</p>}
    </>
  )
}

/** The line under a block's heading, where it has one. */
function lineOf(asset: ShownAsset, view: AssetView<ShownAsset>): string | null {
  switch (view.kind) {
    case "there":
    case "missing": {
      return ASSET_WORDS[asset][view.kind]
    }
    case "line":
    case "hidden": {
      return null
    }
    default: {
      return assertNever(view)
    }
  }
}

/**
 * One file's block: shown; not made, with Generate where home can make it
 * alone; or on the line, from the step home answered Generate with until
 * the list is read again, then the list's.
 */
const AssetBlock = ({
  feed,
  episode,
  asset,
}: {
  feed: Feed
  episode: Episode
  asset: ShownAsset
}): JSX.Element | null => {
  // Read each time the page opens (the app's default is not to), so a file
  // home made since, or an answer home couldn't give before, shows.
  const listed = episode.assets?.[asset]
  // Keyed by its step too, so the file is read again once home's list says
  // it moved (made since the page opened, say) rather than staying hidden.
  const { data } = useQuery({
    queryKey: ["feeds", feed, "asset", asset, episode.key, listed?.state],
    queryFn: ({ signal }) =>
      episodeAsset(feed, episode.key, asset, () => !signal.aborted),
    refetchOnMount: "always",
    // The block holds still while the file is read again (HS1).
    placeholderData: keepPreviousData,
    retry: false,
  })
  const produce = useAsyncIntent(
    (alone: AloneAsset) => produceAsset(feed, episode.key, alone),
    { presentation: "interactive" }
  )
  // The list Generate was tapped over (`latestStep`).
  const [askedOver, setAskedOver] = useState<Episode | null>(null)
  const { state } = produce
  const answered =
    state.status === "succeeded" &&
    state.value.kind === "step" &&
    askedOver === episode
      ? state.value.step
      : null
  const said =
    state.status === "succeeded" && state.value.kind !== "step"
      ? ASSET_WORDS.produced[state.value.kind]
      : state.status === "failed"
        ? ASSET_WORDS.produced.unreadable
        : null
  const view = assetView(asset, data, latestStep(listed, answered))
  if (view.kind === "hidden") return null
  const line = lineOf(asset, view)
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      {said !== null && <Notice onDismiss={produce.reset}>{said}</Notice>}
      <h2 className="text-sm font-medium">{ASSET_WORDS[asset].heading}</h2>
      {line !== null && <p className="text-muted-foreground text-xs">{line}</p>}
      {view.kind === "there" && (
        <There feed={feed} episodeKey={episode.key} content={view.content} />
      )}
      {view.kind === "line" && <OnTheLine asset={asset} step={view.step} />}
      {view.kind === "missing" && view.generate !== null && (
        <Button
          size="sm"
          className="self-start"
          disabled={state.status === "working"}
          onClick={() => {
            if (view.generate === null) return
            setAskedOver(episode)
            produce.start(view.generate)
          }}
        >
          {state.status === "working"
            ? ASSET_WORDS.asking
            : ASSET_WORDS.generate}
        </Button>
      )}
    </section>
  )
}

/** An episode's files beside its video, each its own block. */
export const EpisodeFiles = ({
  feed,
  episode,
}: {
  feed: Feed
  episode: Episode
}): JSX.Element => {
  // The conveyor moves on its own while a file is on the line (the owner,
  // 2026-11-22): the list is read again as Studio › Renders reads its board.
  // Only the interval reads: a static query is never read on mount, on the
  // read turning on, on reconnect or on a drag down (which reads the list
  // itself), and the interval holds while the page is hidden.
  useQuery({
    queryKey: ["feeds", feed, "under-way", episode.key],
    queryFn: () => readListAgain(feed),
    initialData: null,
    staleTime: "static",
    refetchInterval: againWhileUnderWay(
      SHOWN_ASSETS.some((asset) => stepUnderWay(episode.assets?.[asset]))
    ),
    retry: false,
  })
  return (
    <>
      {SHOWN_ASSETS.map((asset) => (
        <AssetBlock key={asset} feed={feed} episode={episode} asset={asset} />
      ))}
    </>
  )
}

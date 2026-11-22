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
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import type { AloneAsset } from "@some-ui/video-render/assets"
import { useQuery } from "@tanstack/react-query"

import type { Feed } from "@/lib/call-videos"
import {
  ASSET_WORDS,
  episodeAsset,
  produceAsset,
  saveThumbnail,
} from "@/lib/call-videos"
import type {
  AssetContent,
  AssetView,
  ShownAsset,
} from "@/lib/call-videos/assets"
import { assetView, SHOWN_ASSETS } from "@/lib/call-videos/assets"
import type { Episode } from "@/lib/call-videos/model"
import { useAsyncIntent } from "@/lib/intent"
import { CopyButton } from "@/components/copy-button"

/** A thumbnail, with Save, which hands it to the share sheet. */
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
  const failed =
    save.state.status === "failed" ||
    (save.state.status === "succeeded" && !save.state.value)
  return (
    <>
      {failed && (
        <Notice onDismiss={save.reset}>{ASSET_WORDS.saveFailed}</Notice>
      )}
      <img
        src={`data:image/png;base64,${base64}`}
        alt={ASSET_WORDS.thumbnail.alt}
        className="aspect-video w-full rounded-md"
      />
      <Button
        size="sm"
        className="self-start"
        disabled={save.state.status === "working"}
        onClick={() => save.start(base64)}
      >
        {ASSET_WORDS.save}
      </Button>
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

/** Generate: asks home once to make a file, and says what came of it. */
const Generate = ({
  feed,
  episodeKey,
  asset,
}: {
  feed: Feed
  episodeKey: string
  asset: AloneAsset
}): JSX.Element => {
  const produce = useAsyncIntent(
    (alone: AloneAsset) => produceAsset(feed, episodeKey, alone),
    { presentation: "interactive" }
  )
  const { state } = produce
  const said =
    state.status === "succeeded"
      ? ASSET_WORDS.produced[state.value.kind]
      : state.status === "failed"
        ? ASSET_WORDS.produced.unreadable
        : null
  return (
    <>
      {said !== null && <Notice onDismiss={produce.reset}>{said}</Notice>}
      <Button
        size="sm"
        className="self-start"
        disabled={state.status === "working"}
        onClick={() => produce.start(asset)}
      >
        {state.status === "working" ? ASSET_WORDS.asking : ASSET_WORDS.generate}
      </Button>
    </>
  )
}

/** The line under a block's heading, by what it shows; none while hidden. */
function lineOf(asset: ShownAsset, view: AssetView<ShownAsset>): string | null {
  const words = ASSET_WORDS[asset]
  switch (view.kind) {
    case "there":
    case "missing":
    case "asked":
    case "failed": {
      return words[view.kind]
    }
    case "hidden": {
      return null
    }
    default: {
      return assertNever(view)
    }
  }
}

/** One file's block: shown, made on asking, asked for, or not made. */
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
  const { data } = useQuery({
    queryKey: ["feeds", feed, "asset", asset, episode.key],
    queryFn: ({ signal }) =>
      episodeAsset(feed, episode.key, asset, () => !signal.aborted),
    refetchOnMount: "always",
    retry: false,
  })
  const view = assetView(asset, data, episode.assets?.[asset])
  const line = lineOf(asset, view)
  if (line === null) return null
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">{ASSET_WORDS[asset].heading}</h2>
      <p className="text-muted-foreground text-xs">{line}</p>
      {view.kind === "there" && (
        <There feed={feed} episodeKey={episode.key} content={view.content} />
      )}
      {view.kind === "missing" && view.generate !== null && (
        <Generate feed={feed} episodeKey={episode.key} asset={view.generate} />
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
}): JSX.Element => (
  <>
    {SHOWN_ASSETS.map((asset) => (
      <AssetBlock key={asset} feed={feed} episode={episode} asset={asset} />
    ))}
  </>
)

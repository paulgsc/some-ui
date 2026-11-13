/**
 * A template's preview on its Templates page (SFEED12, #2757): Make a
 * preview asks first what home will make (#2899), then asks home for a
 * short video of the template from its sample, says over the page that home
 * took it, with the way to Renders, and the
 * page says how far home has got, and once it's ready, Watch brings it to the
 * phone and plays it. Reads `lib/template-preview`'s snapshot and says what
 * was pressed; every word is its `PREVIEW_WORDS`. Phone build only.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice, useConfirmSheet } from "@some-ui/shared"
import type { TemplateId } from "@some-ui/video-render"
import { templateFormat } from "@some-ui/video-render"
import { useNavigate } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import {
  previewRefresher,
  templatePreview,
  PREVIEW_WORDS as WORDS,
} from "@/lib/template-preview"
import type { TemplatePreview as Runtime } from "@/lib/template-preview"
import type { Preview, PreviewState, Said } from "@/lib/template-preview/model"
import { Part } from "@/components/studio/layout"
import { VideoFetch } from "@/components/video-fetch"

const Watching = ({
  preview,
  state,
  runtime,
}: {
  preview: Preview
  state: PreviewState
  runtime: Runtime
}): JSX.Element => {
  const fetch = state.fetch?.id === preview.id ? state.fetch.fetch : undefined
  if (fetch?.kind === "ready") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- the preview's captions are burned into its frames, and home makes no caption file
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
      bytes={preview.bytes ?? null}
      onWatch={() => void runtime.watch()}
      className="self-start"
    />
  )
}

/** Home's preview as it stands, or what the page says while it can't show one. */
const Standing = ({
  state,
  runtime,
  pair,
}: {
  state: PreviewState
  runtime: Runtime
  pair: JSX.Element
}): JSX.Element => {
  const { home } = state
  switch (home.kind) {
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
          <p className="text-sm">{WORDS[home.kind]}</p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => void runtime.open()}
          >
            {WORDS.tryAgain}
          </Button>
        </div>
      )
    }
    case "read": {
      const { preview } = home
      if (preview === null)
        return <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {(preview.state === "failed" && WORDS.failedWhy(preview.failed)) ||
              WORDS.standing[preview.state]}
          </p>
          {preview.state === "ready" &&
            preview.made_at !== undefined &&
            preview.expires_at !== undefined && (
              <p className="text-muted-foreground text-xs">
                {WORDS.kept(preview.made_at, preview.expires_at)}
              </p>
            )}
          {preview.state === "ready" && (
            <Watching preview={preview} state={state} runtime={runtime} />
          )}
        </div>
      )
    }
    default: {
      return assertNever(home)
    }
  }
}

/** What the page says once, over itself, of `said`. */
const saying = (said: Said, title: string): string => {
  switch (said.kind) {
    case "asked": {
      return WORDS.asked(title)
    }
    case "makeFailed": {
      return WORDS.makeFailed[said.why]
    }
    case "readFailed": {
      return WORDS.readFailed[said.why]
    }
    default: {
      return assertNever(said)
    }
  }
}

export const TemplatePreview = ({
  template,
  pair,
}: {
  template: TemplateId
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
}): JSX.Element => {
  const runtime = templatePreview(template)
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { ask, sheet } = useConfirmSheet()
  const navigate = useNavigate()
  const title = templateFormat(template).title
  useEffect(() => {
    void runtime.open()
    return screenRefreshers.register(previewRefresher(template))
  }, [runtime, template])
  return (
    <Part label={WORDS.heading}>
      <p className="text-muted-foreground text-sm">{WORDS.intro}</p>
      {state.said !== null && (
        <Notice
          key={saying(state.said, title)}
          onDismiss={() => runtime.seen()}
          action={
            // Renders is the phone's ("apk"), as this page is (A3).
            state.said.kind === "asked" && hasAudience("apk")
              ? {
                  label: WORDS.seeRenders,
                  onClick: (): void => {
                    runtime.seen()
                    void navigate({ to: "/journal/renders" })
                  },
                }
              : undefined
          }
        >
          {saying(state.said, title)}
        </Notice>
      )}
      {sheet}
      <Button
        size="sm"
        className="self-start"
        disabled={state.asking || state.home.kind === "unpaired"}
        onClick={() =>
          ask({
            title: WORDS.confirm.title(title),
            description: WORDS.confirm.description,
            confirm: WORDS.confirm.confirm,
            keep: WORDS.confirm.keep,
            onConfirm: () => void runtime.make(),
          })
        }
      >
        {state.asking ? WORDS.asking : WORDS.make}
      </Button>
      <Standing state={state} runtime={runtime} pair={pair} />
    </Part>
  )
}

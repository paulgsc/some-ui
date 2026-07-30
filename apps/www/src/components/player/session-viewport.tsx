import type { JSX } from "react"
import { useEffect, useMemo } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import {
  setSessionKey,
  setSuspended,
  useSceneLifetimes,
  useSessionKey,
  useSuspended,
} from "some-ui-utils"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import { useHangulVocab } from "@/lib/hangul-vocab"
import { useLeetypeChallenges } from "@/lib/leetype-challenges"
import type { SessionRecord } from "@/lib/tenant"

import { defineSceneProps, withSceneProps } from "./scene-props"
import { useLiveLayoutEditor } from "./use-live-layout-editor"

const BIND_OPTIONS = Object.keys(componentRegistry).map((key) => ({
  value: key,
  label: key,
}))

type SessionViewportProps = {
  session: SessionRecord
}

export const SessionViewport = ({
  session,
}: SessionViewportProps): JSX.Element => {
  const activeLifetimes = useSceneLifetimes()
  const {
    editMode,
    toggleEditMode,
    tree,
    onTreeChange,
    effectiveLifetimes,
    boundLeafIds,
    onBind,
    onLeafResize,
  } = useLiveLayoutEditor(session, activeLifetimes)

  // This is the layer with write authority over both facts - which session
  // is live, and whether the layout editor currently needs exclusive
  // control - so it's the only place that ever calls these setters. Every
  // registry component downstream only ever sees the resolved values as
  // plain props (extraProps below), never this store.
  useEffect(() => {
    setSessionKey(session.id)
  }, [session.id])

  useEffect(() => {
    setSuspended(editMode)
  }, [editMode])

  const sessionKey = useSessionKey()
  const suspended = useSuspended()
  const hangulWords = useHangulVocab()
  const { challenges, isPending: challengesPending } = useLeetypeChallenges()

  // Each panel's runtime props, associated with the one registry key that
  // consumes them. Nothing here is cross-cutting - `words`/`sessionKey`/
  // `suspended` are HangulHexGrid's alone, `challenges`/`challengesPending`
  // are Leetype's alone - so the association is made statically here rather
  // than by merging one bag onto every panel in the viewport.
  // Built through `defineSceneProps` rather than annotated: a plain
  // ScenePropsMap annotation would not catch a misspelled registry key here -
  // see that function's own comment.
  const sceneProps = useMemo(
    () =>
      defineSceneProps({
        hangul: {
          sessionKey: sessionKey ?? undefined,
          suspended,
          words: hangulWords,
        },
        leetype: {
          challenges,
          // Leetype's picker is a blocking step of the session, so it has to
          // know the difference between "this build has no corpus" and "this
          // build's corpus is still on the wire" - see useLeetypeChallenges.
          challengesPending,
        },
      }),
    [sessionKey, suspended, hangulWords, challenges, challengesPending]
  )

  const renderedLifetimes = useMemo(
    () => withSceneProps(effectiveLifetimes, sceneProps),
    [effectiveLifetimes, sceneProps]
  )

  return (
    <div className="bg-muted relative w-full flex-1 min-h-0 overflow-hidden rounded-lg border">
      {activeLifetimes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Press Play to begin</p>
        </div>
      ) : (
        <>
          <OrchestratedYouTubeViewport
            layoutTree={tree}
            activeLifetimes={renderedLifetimes}
            componentRegistry={componentRegistry}
            enableFocus={false}
            collapseUnbound={!editMode}
            onLeafResize={onLeafResize}
          />

          {editMode && (
            <LiveEditOverlay
              tree={tree}
              onTreeChange={onTreeChange}
              boundLeafIds={boundLeafIds}
              bindOptions={BIND_OPTIONS}
              onBind={onBind}
            />
          )}

          <button
            type="button"
            onClick={toggleEditMode}
            className="absolute top-2 right-2 z-50 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
          >
            {editMode
              ? "Editing layout — press E to exit"
              : "Press E to edit layout"}
          </button>
        </>
      )}
    </div>
  )
}

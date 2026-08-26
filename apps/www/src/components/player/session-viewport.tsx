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

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { useHangulVocab } from "@/lib/hangul-vocab"
import { AmbientIntentStatus } from "@/lib/intent/render"
import type { SessionRecord } from "@/lib/tenant"
import { loadTopikFile, loadTopikManifest } from "@/lib/topik-content"

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
    autosaveStatus,
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
  // The effects channel, live. Honeycomb owns the sounds; the person owns
  // whether they play, and this is the seam between the two - without it,
  // the "Game sounds" toggle in the audio indicator would control nothing.
  const { preferences: audioPreferences } = useAudioPreferences()

  // Each panel's runtime props, associated with the one registry key that
  // consumes them. Nothing here is cross-cutting - `words`/`sessionKey`/
  // `suspended` are HangulHexGrid's alone - so the association is made
  // statically here rather than by merging one bag onto every panel in the
  // viewport.
  //
  // `leetype` is deliberately absent: it needs nothing injected. Its
  // exercises come from its own shim (@some-ui/leetype's
  // lib/leetype/exercises), which is the single seam a future generator
  // replaces - a corpus threaded through this app would be a second one.
  //
  // That stayed true when it grew a second surface. Below the small-screen
  // breakpoint the activity switches from a typing probe to a reading one
  // (LTY-MOBILE), and the switch is entirely inside the package: `Leetype`
  // reads the viewport itself and mounts one surface or the other. Nothing
  // here passes a `surface` prop, and nothing here should - a host deciding
  // which probe a device gets would be this app holding an opinion about a
  // package's internals, and the registry contract (render with no props) is
  // exactly what that would break.
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
          audio: audioPreferences.effects,
        },
        topik: {
          // Plain functions, not repositories: importing topik's factories
          // here would pull the applet into this app's main bundle and undo
          // the registry's lazy import. See src/lib/topik-content.
          loadManifest: loadTopikManifest,
          loadTopik: loadTopikFile,
        },
      }),
    [sessionKey, suspended, hangulWords, audioPreferences.effects]
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

      <AmbientIntentStatus
        state={autosaveStatus}
        className="absolute bottom-2 left-2 z-50 rounded-md border bg-background/90 px-2 py-1 shadow-sm"
      />
    </div>
  )
}

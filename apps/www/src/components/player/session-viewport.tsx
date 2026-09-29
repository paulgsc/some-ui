import type { JSX } from "react"
import { useEffect, useMemo } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import {
  cn,
  setSessionKey,
  setSuspended,
  useIsMobile,
  useSceneLifetimes,
  useSessionKey,
  useSuspended,
} from "some-ui-utils"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { useHasSession } from "@/lib/auth"
import { useHangulVocab } from "@/lib/hangul-vocab"
import { AmbientIntentStatus } from "@/lib/intent/render"
import { loadLeetypeRounds } from "@/lib/leetype-content"
import { createShelfClient } from "@/lib/shelf-client"
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
  /**
   * The live layout editor is a desktop authoring affordance, and on a phone
   * it is not merely cramped — it is unreachable. Every one of its gestures
   * assumes hardware that is not there: `E` to enter it needs a keyboard,
   * right-click resize needs a mouse, and dragging a topology needs a
   * pointer with hover. What it leaves behind on a small screen is a button
   * advertising a mode that cannot be entered, a border and a corner radius
   * inset from the edges of a screen with no room to spare, and an activity
   * squeezed into the remainder.
   *
   * So on a phone `V` is the screen: no editor, no frame, no inset. The hook
   * below still runs — it holds this session's layout and its autosave, both
   * of which matter regardless of who can edit them — but nothing it exposes
   * for editing is rendered.
   */
  const isMobile = useIsMobile()
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
  // The learner shelf (paulgsc/server#387): offered only while the client
  // believes there is a passkey session, since every shelf route is per
  // person and answers 401 without one, and never on a build with no
  // file_host (`createShelfClient` is then undefined). A session ending
  // mid-lesson takes the shelf away with it; the lesson plays on, because
  // nothing in either activity depends on a shelf being there.
  const signedIn = useHasSession()
  const shelves = useMemo(
    () =>
      signedIn
        ? {
            topik: createShelfClient("topik"),
            leetype: createShelfClient("leetype"),
          }
        : undefined,
    [signedIn]
  )

  // Each panel's runtime props, associated with the one registry key that
  // consumes them. Nothing here is cross-cutting - `words`/`sessionKey`/
  // `suspended` are HangulHexGrid's alone - so the association is made
  // statically here rather than by merging one bag onto every panel in the
  // viewport.
  //
  // `leetype`'s exercises still need nothing injected: they come from its
  // own shim (@some-ui/leetype's lib/leetype/exercises). Its rounds do
  // (H1, #1231; canon Rem. 11.4): `loadRounds` fetches the served round
  // corpus, and the package falls back to its bundled rounds when this
  // resolves empty (a static build) or rejects. See src/lib/leetype-content.
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
          shelf: shelves?.topik,
        },
        leetype: {
          // A plain function for the same reason; the package parses what
          // it returns.
          loadRounds: loadLeetypeRounds,
          shelf: shelves?.leetype,
        },
      }),
    [sessionKey, suspended, hangulWords, audioPreferences.effects, shelves]
  )

  const renderedLifetimes = useMemo(
    () => withSceneProps(effectiveLifetimes, sceneProps),
    [effectiveLifetimes, sceneProps]
  )

  const editable = !isMobile

  return (
    <div
      className={cn(
        "bg-muted relative w-full flex-1 min-h-0 overflow-hidden",
        // Full-bleed on a phone. The frame is what tells a desktop user
        // where the session viewport ends and the dashboard resumes; on a
        // phone there is no dashboard around it to distinguish it from.
        !isMobile && "rounded-lg border"
      )}
    >
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
            collapseUnbound={editable ? !editMode : true}
            onLeafResize={onLeafResize}
          />

          {editable && editMode && (
            <LiveEditOverlay
              tree={tree}
              onTreeChange={onTreeChange}
              boundLeafIds={boundLeafIds}
              bindOptions={BIND_OPTIONS}
              onBind={onBind}
            />
          )}

          {editable && (
            <button
              type="button"
              onClick={toggleEditMode}
              className="absolute top-2 right-2 z-50 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
            >
              {editMode
                ? "Editing layout — press E to exit"
                : "Press E to edit layout"}
            </button>
          )}
        </>
      )}

      {/* The layout autosave's failure notice. Suppressed on a phone along
          with the editor that produces the edits: nothing there can change a
          layout, so a notice about a layout write failing is a report about
          a thing the reader did not do and cannot retry. */}
      {editable && (
        <AmbientIntentStatus
          state={autosaveStatus}
          className="absolute bottom-2 left-2 z-50 rounded-md border bg-background/90 px-2 py-1 shadow-sm"
        />
      )}
    </div>
  )
}

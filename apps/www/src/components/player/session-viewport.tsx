import type { JSX } from "react"
import { useEffect, useMemo } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { useAuthority } from "@/lib/authority"
import { phoneDictation, runsNatively } from "@/lib/dictation"
import { useHangulVocab } from "@/lib/hangul-vocab"
import { AmbientIntentStatus } from "@/lib/intent/render"
import { loadLeetypeRoundRuns, loadLeetypeRounds } from "@/lib/leetype-content"
import {
  setSessionKey,
  setSuspended,
  useSceneLifetimes,
  useSessionKey,
  useSuspended,
} from "@/lib/orchestrator"
import { createShelfClient } from "@/lib/shelf-client"
import type { SessionRecord } from "@/lib/tenant"
import { loadTopikFile, loadTopikManifest } from "@/lib/topik-content"

import { defineSceneProps, withSceneProps } from "./scene-props"
import { useLiveLayoutEditor } from "./use-live-layout-editor"

/**
 * LeetType's margin-note recognizer: the phone's own inside the Android app
 * (src/lib/dictation), absent elsewhere so the package uses the browser's.
 * Gated on native, not the device build: that build in a desktop browser has
 * only the plugin's web stub. Holds nothing until a learner taps Speak.
 */
const PHONE_DICTATION =
  import.meta.env.VITE_DEVICE_BACKEND === "true" && runsNatively()
    ? phoneDictation()
    : undefined

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
   * The live layout editor needs a keyboard, a mouse and hover, so on a phone
   * it is unreachable: there `V` is the screen, with no editor, frame or
   * inset. The hook still runs, for the layout and its autosave.
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

  // The only layer with write authority over which session is live and
  // whether the editor needs exclusive control; downstream sees plain props.
  useEffect(() => {
    setSessionKey(session.id)
  }, [session.id])

  useEffect(() => {
    setSuspended(editMode)
  }, [editMode])

  const sessionKey = useSessionKey()
  const suspended = useSuspended()
  const hangulWords = useHangulVocab()
  // The person owns whether Honeycomb's sounds play ("Game sounds").
  const { preferences: audioPreferences } = useAudioPreferences()
  // The learner shelf (paulgsc/server#387): only while the data is the
  // account's (every shelf route is per person) and a file_host exists. A
  // device learner keeps no shelf. Nothing in either activity depends on it.
  const signedIn = useAuthority().kind === "account"
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

  // Each panel's runtime props, keyed by the one registry key that consumes
  // them.
  //
  // `leetype`'s rounds (H1, #1231; canon Rem. 11.4): `loadRounds` fetches the
  // served corpus, and the package falls back to bundled rounds when it
  // resolves empty or rejects (src/lib/leetype-content). Its small-screen
  // reading surface (LTY-MOBILE) is chosen inside the package; no `surface`
  // prop here, since the registry contract is render-with-no-props.
  // Built through `defineSceneProps` so a misspelled registry key is caught.
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
          // Plain functions: importing topik's factories would pull the
          // applet into the main bundle (src/lib/topik-content).
          loadManifest: loadTopikManifest,
          loadTopik: loadTopikFile,
          shelf: shelves?.topik,
        },
        leetype: {
          // A plain function too; the package parses what it returns.
          loadRounds: loadLeetypeRounds,
          // Fetched in `server` mode, nothing in `static` (bundled).
          loadRuns: loadLeetypeRoundRuns,
          shelf: shelves?.leetype,
          // The phone's recognizer on Android, whose WebView has none.
          dictation: PHONE_DICTATION,
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
        // Full-bleed on a phone: there is no dashboard to frame it against.
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

      {/* The layout autosave's failure notice, hidden on a phone along with
          the editor: nothing there can change a layout. */}
      {editable && (
        <AmbientIntentStatus
          state={autosaveStatus}
          className="absolute bottom-2 left-2 z-50 rounded-md border bg-background/90 px-2 py-1 shadow-sm"
        />
      )}
    </div>
  )
}

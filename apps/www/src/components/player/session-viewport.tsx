import type { JSX } from "react"
import { useEffect, useMemo } from "react"
import type { RegistryKey } from "@some-ui/content-registry"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import { useAuthority } from "@/lib/authority"
import { viewerSessionFiles } from "@/lib/demo/leetype-sample"
import { AmbientIntentStatus } from "@/lib/intent/render"
import { phoneSessionFiles } from "@/lib/leetype-files"
import { phoneSpokenTakes } from "@/lib/leetype-takes"
import { phoneLensTakes } from "@/lib/lens-takes"
import {
  setSessionKey,
  setSuspended,
  useIsPaused,
  useSceneLifetimes,
} from "@/lib/orchestrator"
import { PANELS } from "@/lib/playable"
import { createRoutineFilesClient } from "@/lib/routine-files"
import { phoneSceneVoice, shareDramaPrompt } from "@/lib/scene-voice"
import { lookIn, runsNatively } from "@/lib/share-files"
import { createShelfClient } from "@/lib/shelf-client"
import type { SessionRecord } from "@/lib/tenant"
import {
  loadTopikFile,
  loadTopikManifest,
  loadTreeManifest,
} from "@/lib/topik-content"
import { WEB_PANEL_KEYS } from "@/lib/web-surface"

import { defineSceneProps, withSceneProps } from "./scene-props"
import { useLiveLayoutEditor } from "./use-live-layout-editor"
import { withWebOnlyNotes } from "./web-only-note"

/**
 * The drama's share sheet and microphone: gated on native, not the device
 * build, since that build in a desktop browser has only the plugins' web
 * stubs.
 */
const ON_PHONE =
  import.meta.env.VITE_DEVICE_BACKEND === "true" && runsNatively()
const PHONE_SHARE = ON_PHONE ? shareDramaPrompt : undefined
const PHONE_SCENE_VOICE = ON_PHONE ? phoneSceneVoice() : undefined
const PHONE_LENS_TAKES = ON_PHONE ? phoneLensTakes() : undefined
const PHONE_SPOKEN_TAKES = ON_PHONE ? phoneSpokenTakes() : undefined
const PHONE_SESSION_FILES = ON_PHONE ? phoneSessionFiles() : undefined
/**
 * The flag is read here, not through `VIEWER_BUILD`, so other builds fold
 * the branch before chunking and ship no sample.
 */
const VIEWER_SESSION_FILES =
  import.meta.env.VITE_STATIC_DATA === "true" ? viewerSessionFiles() : undefined

/** What the player renders: the bound panels, and a note for a web one. */
const PLAYER_PANELS = withWebOnlyNotes(PANELS, WEB_PANEL_KEYS)

const BIND_OPTIONS = Object.keys(PANELS).map((key) => ({
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
  // whether the editor needs exclusive control; a panel that cares reads them.
  // Released on unmount: with no viewport, no session is live and nothing
  // holds the editor.
  useEffect(() => {
    setSessionKey(session.id)
    return (): void => setSessionKey(null)
  }, [session.id])

  useEffect(() => {
    setSuspended(editMode)
    return (): void => setSuspended(false)
  }, [editMode])

  // The learner shelf (paulgsc/server#387) and what the reflections routine
  // left on home (`/routine/files`): only while the data is the account's
  // (both are per person) and a file_host exists. A device learner has
  // neither. Nothing in the activity depends on them.
  const signedIn = useAuthority().kind === "account"
  const shelves = useMemo(
    () =>
      signedIn
        ? {
            topik: createShelfClient("topik"),
            routineFiles: createRoutineFilesClient(),
          }
        : undefined,
    [signedIn]
  )

  const paused = useIsPaused()

  // Each panel's runtime props, keyed by the one registry key that consumes
  // them.
  //
  // `leetype`: the phone plays session files picked from storage (canon
  // Rem. 11.7), a viewer a sample (`lib/demo`), and a wide window gets the typing surface, chosen inside the
  // package; no `surface` prop here, since the registry contract is
  // render-with-no-props.
  // Built through `defineSceneProps` so a misspelled registry key is caught.
  const sceneProps = useMemo(
    () =>
      defineSceneProps({
        topik: {
          // Plain functions: importing topik's factories would pull the
          // applet into the main bundle (src/lib/topik-content).
          loadManifest: loadTopikManifest,
          loadTopik: loadTopikFile,
          // The served scene trees, which only the handheld lesson lists.
          loadTreeManifest,
          shelf: shelves?.topik,
          // What the reflections routine left on home, as `shelf` is.
          routineFiles: shelves?.routineFiles,
          share: PHONE_SHARE,
          sceneVoice: PHONE_SCENE_VOICE,
          // Read at render: main.tsx installs the sidecar after imports run.
          sceneFileHint: ON_PHONE ? lookIn("drama-tree") : undefined,
          wordSetHint: ON_PHONE ? lookIn("word-set") : undefined,
          // Kept only where the study-context export carries it (Rem. 4.18).
          recordsLens: ON_PHONE,
          lensTakes: PHONE_LENS_TAKES,
          paused,
        },
        leetype: {
          takes: PHONE_SPOKEN_TAKES,
          // Read at render, as topik's hints are.
          sessionFiles:
            PHONE_SESSION_FILES !== undefined
              ? {
                  store: PHONE_SESSION_FILES,
                  hint: lookIn("leetype-session"),
                }
              : VIEWER_SESSION_FILES && {
                  store: VIEWER_SESSION_FILES,
                  samples: true,
                },
        },
      }),
    [shelves, paused]
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
          {/* Typed over the keys every build binds. A web panel is found
              like any key a saved scene names: by lookup. */}
          <OrchestratedYouTubeViewport<RegistryKey>
            layoutTree={tree}
            activeLifetimes={renderedLifetimes}
            componentRegistry={PLAYER_PANELS}
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

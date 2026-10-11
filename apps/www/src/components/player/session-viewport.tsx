import type { JSX } from "react"
import { useEffect, useMemo } from "react"
import type { RegistryKey } from "@some-ui/content-registry"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import { useAuthority } from "@/lib/authority"
import { phoneDictation, runsNatively } from "@/lib/dictation"
import { AmbientIntentStatus } from "@/lib/intent/render"
import { loadLeetypeRoundRuns, loadLeetypeRounds } from "@/lib/leetype-content"
import {
  setSessionKey,
  setSuspended,
  useSceneLifetimes,
} from "@/lib/orchestrator"
import { PANELS } from "@/lib/playable"
import { shareDramaPrompt } from "@/lib/share-files"
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
 * The Android app's own ports, absent elsewhere: LeetType's margin-note
 * recognizer (src/lib/dictation; elsewhere the package uses the browser's)
 * and the share sheet for the drama's next-scene prompt. Gated on native,
 * not the device build: that build in a desktop browser has only the
 * plugins' web stubs. Neither holds anything until a learner taps.
 */
const [PHONE_DICTATION, PHONE_SHARE] =
  import.meta.env.VITE_DEVICE_BACKEND === "true" && runsNatively()
    ? ([phoneDictation(), shareDramaPrompt] as const)
    : []

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
  useEffect(() => {
    setSessionKey(session.id)
  }, [session.id])

  useEffect(() => {
    setSuspended(editMode)
  }, [editMode])

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
  // resolves empty or rejects (src/lib/leetype-content). The phone gets
  // rounds and a wide window the typing surface, chosen inside the package;
  // no `surface` prop here, since the registry contract is
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
          share: PHONE_SHARE,
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
    [shelves]
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

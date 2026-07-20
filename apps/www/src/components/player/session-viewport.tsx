import type { JSX } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { useSceneLifetimes } from "some-ui-utils"
import { LiveEditOverlay, OrchestratedYouTubeViewport } from "wireframes"

import type { SessionRecord } from "@/lib/tenant"

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
  } = useLiveLayoutEditor(session, activeLifetimes)

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
            activeLifetimes={effectiveLifetimes}
            componentRegistry={componentRegistry}
            enableFocus={false}
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

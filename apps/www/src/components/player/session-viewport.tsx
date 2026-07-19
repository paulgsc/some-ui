import type { JSX } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { useSceneLifetimes } from "some-ui-utils"
import { OrchestratedYouTubeViewport, useSceneDrivenLayout } from "wireframes"

import { FALLBACK_LAYOUT } from "./layout"

export const SessionViewport = (): JSX.Element => {
  const activeLifetimes = useSceneLifetimes()
  const { currentLayout } = useSceneDrivenLayout()

  return (
    <div className="bg-muted relative w-full flex-1 min-h-0 overflow-hidden rounded-lg border">
      {activeLifetimes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Press Play to begin</p>
        </div>
      ) : (
        <OrchestratedYouTubeViewport
          layoutTree={currentLayout ?? FALLBACK_LAYOUT}
          activeLifetimes={activeLifetimes}
          componentRegistry={componentRegistry}
          enableFocus={false}
        />
      )}
    </div>
  )
}

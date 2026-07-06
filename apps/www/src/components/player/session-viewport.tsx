import type { JSX } from "react"
import { componentRegistry } from "@some-ui/content"
import { useSceneLifetimes } from "some-ui-utils"
import { OrchestratedYouTubeViewport } from "wireframes"

import { MAIN_CONTENT_LAYOUT } from "./layout"

export const SessionViewport = (): JSX.Element => {
  const activeLifetimes = useSceneLifetimes()

  return (
    <div className="bg-muted relative h-[680px] w-full overflow-hidden rounded-lg border">
      {activeLifetimes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Press Play to begin</p>
        </div>
      ) : (
        <OrchestratedYouTubeViewport
          layoutTree={MAIN_CONTENT_LAYOUT}
          activeLifetimes={activeLifetimes}
          componentRegistry={componentRegistry}
          enableFocus={false}
        />
      )}
    </div>
  )
}

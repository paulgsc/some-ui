import type { JSX } from "react"
import type { SceneConfig } from "some-types-utils"
import { useOrchestratorClock, usePrimaryScene } from "some-ui-utils"

import { friendlyActivityName } from "./utils"

type NowNextStripProps = {
  scenes: Array<SceneConfig>
}

export const NowNextStrip = ({
  scenes,
}: NowNextStripProps): JSX.Element | null => {
  const { current_time: currentTime } = useOrchestratorClock()
  const primaryScene = usePrimaryScene()

  if (!primaryScene) return null

  const upNext = scenes
    .filter((scene) => scene.start_time > currentTime)
    .sort((a, b) => a.start_time - b.start_time)
    .at(0)

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>
        Now playing:{" "}
        <span className="text-foreground font-medium">
          {friendlyActivityName(
            primaryScene.kind.Scene.scene_name,
            primaryScene.kind.Scene.ui
          )}
        </span>
      </span>
      {upNext && (
        <span>
          Up next:{" "}
          <span className="text-foreground font-medium">
            {friendlyActivityName(upNext.scene_name, upNext.ui)}
          </span>
        </span>
      )}
    </div>
  )
}

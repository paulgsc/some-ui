import type { JSX } from "react"
import { Pause, Play, SkipForward, Square } from "lucide-react"
import { Button } from "some-ui-shared"
import {
  useIsPaused,
  useIsRunning,
  useOrchestratorClock,
  useOrchestratorStore,
  usePrimaryScene,
} from "some-ui-utils"

import { formatTimecode } from "@/lib/format"

import { friendlyActivityName } from "./utils"

type TransportControlsProps = {
  onPlay: () => void
}

export const TransportControls = ({
  onPlay,
}: TransportControlsProps): JSX.Element => {
  const isRunning = useIsRunning()
  const isPaused = useIsPaused()
  const { time_remaining: timeRemaining } = useOrchestratorClock()
  const primaryScene = usePrimaryScene()
  const pause = useOrchestratorStore((s) => s.pause)
  const resume = useOrchestratorStore((s) => s.resume)
  const stop = useOrchestratorStore((s) => s.stop)
  const skipCurrentScene = useOrchestratorStore((s) => s.skipCurrentScene)

  const nowPlaying = primaryScene
    ? friendlyActivityName(
        primaryScene.kind.Scene.scene_name,
        primaryScene.kind.Scene.ui
      )
    : null

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        {nowPlaying ? (
          <>
            <p className="font-medium">{nowPlaying}</p>
            <p className="text-muted-foreground text-sm">
              {formatTimecode(timeRemaining)} remaining
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Ready to play</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isRunning && !isPaused && (
          <Button onClick={onPlay}>
            <Play className="mr-1.5 size-4" />
            Play
          </Button>
        )}
        {isRunning && (
          <Button variant="secondary" onClick={() => void pause()}>
            <Pause className="mr-1.5 size-4" />
            Pause
          </Button>
        )}
        {isPaused && (
          <Button onClick={() => void resume()}>
            <Play className="mr-1.5 size-4" />
            Resume
          </Button>
        )}
        {(isRunning || isPaused) && (
          <>
            <Button variant="outline" onClick={() => void skipCurrentScene()}>
              <SkipForward className="mr-1.5 size-4" />
              Skip
            </Button>
            <Button variant="destructive" onClick={() => void stop()}>
              <Square className="mr-1.5 size-4" />
              Stop
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

import type { FC } from "react"
import type { SceneConfig } from "@some-ui/types"
import { Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react"
import { Badge, Button, Card } from "@some-ui/shared"
import { cn, selectIsRunning, useOrchestratorStore } from "some-ui-utils"

type OrchestratorControlsProps = { scenes: Array<SceneConfig> }

export const OrchestratorControls: FC<OrchestratorControlsProps> = ({
  scenes,
}) => {
  const isRunning = useOrchestratorStore(selectIsRunning)
  const isConnected = useOrchestratorStore((s) => s.isConnected)
  const isInitializing = useOrchestratorStore((s) => s.isInitializing)

  const configure = useOrchestratorStore((s) => s.configure)
  const onStart = useOrchestratorStore((s) => s.start)
  const onPause = useOrchestratorStore((s) => s.pause)
  const onStop = useOrchestratorStore((s) => s.stop)
  const onReset = useOrchestratorStore((s) => s.reset)
  const onSkip = useOrchestratorStore((s) => s.skipCurrentScene)

  const handleStart = async (): Promise<void> => {
    await configure(scenes)
    await onStart()
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Status Indicators */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge
              variant={isConnected ? "default" : "secondary"}
              className={cn(
                "gap-1.5",
                isConnected &&
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-muted-foreground"
                )}
              />
              {isInitializing
                ? "Reconnecting..."
                : isConnected
                  ? "Connected"
                  : "Disconnected"}
            </Badge>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button
              onClick={handleStart}
              disabled={!isConnected}
              size="lg"
              className="flex-1 gap-2"
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
          ) : (
            <>
              <Button
                onClick={onPause}
                disabled={!isConnected}
                size="lg"
                variant="secondary"
                className="flex-1 gap-2"
              >
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button
                onClick={onStop}
                disabled={!isConnected}
                size="lg"
                variant="destructive"
                className="flex-1 gap-2"
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </>
          )}
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onReset}
            disabled={!isConnected || isRunning}
            variant="outline"
            className="flex-1 gap-2 bg-transparent"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={onSkip}
            disabled={!isConnected || !isRunning}
            variant="outline"
            className="flex-1 gap-2 bg-transparent"
          >
            <SkipForward className="h-4 w-4" />
            Skip Scene
          </Button>
        </div>
      </div>
    </Card>
  )
}

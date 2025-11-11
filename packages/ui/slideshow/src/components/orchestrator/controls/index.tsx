import {
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  Square,
} from "lucide-react"
import { Badge, Button, Card } from "some-ui-shared"
import { cn } from "some-ui-utils"

interface OrchestratorControlsProps {
  isRunning: boolean
  isConnected: boolean
  isReconnecting: boolean
  isStreaming: boolean
  streamTimecode: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onReset: () => void
  onSkip: () => void
}

export function OrchestratorControls({
  isRunning,
  isConnected,
  isReconnecting,
  isStreaming,
  streamTimecode,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  onSkip,
}: OrchestratorControlsProps) {
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
              {isReconnecting
                ? "Reconnecting..."
                : isConnected
                  ? "Connected"
                  : "Disconnected"}
            </Badge>

            {isStreaming && (
              <Badge
                variant="default"
                className="gap-1.5 bg-red-500/10 text-red-600 dark:text-red-400"
              >
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            )}
          </div>

          {isStreaming && (
            <div className="font-mono text-sm text-muted-foreground">
              {streamTimecode}
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button
              onClick={onStart}
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

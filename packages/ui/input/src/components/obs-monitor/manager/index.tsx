import type { JSX } from "react"
import { useState } from "react"
import { Header } from "@input/components/obs-monitor/header"
import { PreviewPane } from "@input/components/obs-monitor/preview-pane"
import { ScriptEditor } from "@input/components/obs-monitor/script-editor"
import { ScriptSidebar } from "@input/components/obs-monitor/script-sidebar"
import { Timeline } from "@input/components/obs-monitor/timeline"
import { Pause, Play, RotateCcw, Square } from "lucide-react"
import { Button } from "@some-ui/shared"

export const OBSScriptManager = (): JSX.Element => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedScript, setSelectedScript] = useState<string | null>(null)

  const handlePlayPause = (): void => {
    setIsPlaying(!isPlaying)
  }

  const handleStop = (): void => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleReset = (): void => {
    setCurrentTime(0)
  }

  return (
    <div className="bg-background flex h-screen flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Script Management Sidebar */}
        <ScriptSidebar
          selectedScript={selectedScript}
          onScriptSelect={setSelectedScript}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Top Section: Script Editor and Preview */}
          <div className="flex min-h-0 flex-1">
            {/* Script Editor */}
            <div className="border-border flex flex-1 flex-col border-r">
              <div className="border-border border-b p-4">
                <h2 className="text-foreground text-lg font-semibold">
                  Script Editor
                </h2>
              </div>
              <div className="flex-1 overflow-hidden">
                <ScriptEditor />
              </div>
            </div>

            {/* Preview Pane */}
            <div className="flex w-96 flex-col">
              <div className="border-border border-b p-4">
                <h2 className="text-foreground text-lg font-semibold">
                  Live Preview
                </h2>
              </div>
              <div className="flex-1">
                <PreviewPane currentTime={currentTime} />
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="border-border bg-card border-t p-4">
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="size-8 bg-transparent p-0"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayPause}
                className="size-8 bg-transparent p-0"
              >
                {isPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                className="size-8 bg-transparent p-0"
              >
                <Square className="size-4" />
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="border-border h-48 border-t">
            <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />
          </div>
        </div>
      </div>
    </div>
  )
}

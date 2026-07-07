import type { JSX } from "react"
import { useState } from "react"
import {
  Activity,
  Eye,
  Monitor,
  Settings,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "some-ui-shared"

type PreviewPaneProps = {
  currentTime: number
}

export const PreviewPane = ({ currentTime }: PreviewPaneProps): JSX.Element => {
  const [previewMode, setPreviewMode] = useState<"live" | "staging">("staging")

  // Mock current state based on timeline
  const getCurrentState = (): {
    scene: string
    sources: Array<{ name: string; active: boolean; muted: boolean }>
  } => {
    if (currentTime < 5) {
      return {
        scene: "Intro Scene",
        sources: [
          { name: "Camera 1", active: true, muted: false },
          { name: "Theme Music", active: false, muted: false },
          { name: "Microphone", active: false, muted: true },
        ],
      }
    } else if (currentTime < 10) {
      return {
        scene: "Intro Scene",
        sources: [
          { name: "Camera 1", active: true, muted: false },
          { name: "Theme Music", active: true, muted: false },
          { name: "Microphone", active: false, muted: true },
        ],
      }
    } else if (currentTime < 60) {
      return {
        scene: "Main Camera",
        sources: [
          { name: "Camera 1", active: true, muted: false },
          { name: "Theme Music", active: true, muted: false },
          { name: "Microphone", active: false, muted: true },
        ],
      }
    }
    return {
      scene: "Main Camera",
      sources: [
        { name: "Camera 1", active: true, muted: false },
        { name: "Theme Music", active: true, muted: false },
        { name: "Microphone", active: true, muted: false },
      ],
    }
  }

  const currentState = getCurrentState()

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Preview Header */}
      <div className="border-border border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="size-4" />
            <span className="text-sm font-medium">Preview</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="size-6 bg-transparent p-0"
          >
            <Settings className="size-3" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant={previewMode === "staging" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("staging")}
            className="text-xs"
          >
            Staging
          </Button>
          <Button
            variant={previewMode === "live" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("live")}
            className="text-xs"
          >
            Live
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 space-y-4 p-4">
        {/* Current Scene */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Monitor className="size-4" />
              Current Scene
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="font-medium">{currentState.scene}</span>
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentState.sources.map((source) => (
              <div
                key={`${currentState.scene}-${source.name}`}
                className="bg-muted/50 flex items-center justify-between rounded p-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`size-2 rounded-full ${source.active ? "bg-green-500" : "bg-gray-400"}`}
                  />
                  <span className="text-sm">{source.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {source.muted ? (
                    <VolumeX className="text-muted-foreground size-3" />
                  ) : (
                    <Volume2 className="size-3 text-green-500" />
                  )}
                  <Badge
                    variant={source.active ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    {source.active ? "ON" : "OFF"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>OBS Connection</span>
              <div className="flex items-center gap-1">
                <Wifi className="size-3 text-green-500" />
                <Badge variant="secondary" className="text-xs">
                  Connected
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Script Status</span>
              <Badge variant="outline" className="text-xs">
                {previewMode === "staging" ? "Staging" : "Live"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Mock Preview Window */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scene Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex aspect-video items-center justify-center rounded bg-black text-sm text-white">
              <div className="text-center">
                <Monitor className="mx-auto mb-2 size-8 opacity-50" />
                <div>{currentState.scene}</div>
                <div className="mt-1 text-xs opacity-50">
                  {Math.floor(currentTime / 60)}:
                  {(Math.floor(currentTime) % 60).toString().padStart(2, "0")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

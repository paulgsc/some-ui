import { useEffect, useState } from "react"
import { AlertCircle, Clock, Code, Layers, Save } from "lucide-react"
import type { SceneConfig, UILayoutIntent } from "some-types-utils"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type EditSceneDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  scene: SceneConfig | null
  onSave: (scene: SceneConfig) => void
}

export const EditSceneDialog = ({
  open,
  onOpenChange,
  scene,
  onSave,
}: EditSceneDialogProps) => {
  const [sceneName, setSceneName] = useState("")
  const [durationSec, setDurationSec] = useState(0)
  const [startTimeSec, setStartTimeSec] = useState<number | undefined>(
    undefined
  )

  // JSON Editor State
  const [uiJson, setUiJson] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    if (!scene) return
    setSceneName(scene.scene_name)
    setDurationSec(Math.floor(scene.duration / 1000))
    setStartTimeSec(
      scene.start_time !== undefined
        ? Math.floor(scene.start_time / 1000)
        : undefined
    )

    // Format existing UI intents for the JSON editor
    setUiJson(JSON.stringify(scene.ui || [], null, 2))
    setJsonError(null)
  }, [scene])

  const validateAndSave = (): void => {
    try {
      const parsedUi = JSON.parse(uiJson)
      if (!Array.isArray(parsedUi))
        throw new Error("UI Intents must be an array")

      onSave({
        ...scene!,
        scene_name: sceneName,
        duration: durationSec * 1000,
        start_time: (startTimeSec ?? 0) * 1000,
        ui: parsedUi as Array<UILayoutIntent>,
      })
      onOpenChange(false)
    } catch (e: any) {
      setJsonError(e.message || "Invalid JSON format")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[85vh] flex flex-col p-0 overflow-hidden bg-card">
        <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Scene Orchestrator
            </DialogTitle>
            {scene && (
              <Badge variant="outline" className="font-mono text-[10px]">
                REV_{scene.duration}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="layout" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="layout" className="gap-2">
                <Code className="w-4 h-4" /> Rich Intent Editor
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2">
                <Clock className="w-4 h-4" /> Timeline Config
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Layout Tab: The JSON Workspace */}
          <TabsContent
            value="layout"
            className="flex-1 flex flex-col min-h-0 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold">Intent Stack</h4>
                <p className="text-xs text-muted-foreground">
                  Paste your `UILayoutIntent` array here to define regions,
                  content, and focus.
                </p>
              </div>
              {jsonError && (
                <Badge variant="destructive" className="animate-pulse gap-1">
                  <AlertCircle className="w-3 h-3" /> Syntax Error
                </Badge>
              )}
            </div>

            <div className="flex-1 relative font-mono text-sm">
              <Textarea
                value={uiJson}
                onChange={(e) => {
                  setUiJson(e.target.value)
                  if (jsonError) setJsonError(null)
                }}
                className={cn(
                  "h-full min-h-full resize-none bg-zinc-950 text-zinc-300 p-4 border-2 transition-colors focus-visible:ring-0",
                  jsonError ? "border-destructive/50" : "border-border"
                )}
                placeholder="[ { 'intent': { ... } } ]"
                spellCheck={false}
              />
              {jsonError && (
                <div className="absolute bottom-4 left-4 right-4 p-2 bg-destructive/10 border border-destructive/20 rounded text-[11px] text-destructive-foreground">
                  {jsonError}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Config Tab: Standard Properties */}
          <TabsContent value="config" className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Scene Display Name</Label>
                <Input
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Layer Persistence</Label>
                <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
                  Standard Transition (Ease-In-Out)
                </div>
              </div>
              <div className="space-y-2">
                <Label>Start Time (Seconds)</Label>
                <Input
                  type="number"
                  placeholder="0 (Sequential)"
                  value={startTimeSec ?? ""}
                  onChange={(e) =>
                    setStartTimeSec(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Total Duration (Seconds)</Label>
                <Input
                  type="number"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 bg-muted/10 border-t gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Discard
          </Button>
          <Button onClick={validateAndSave} className="gap-2">
            <Save className="w-4 h-4" />
            Sync to Timeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from "react"
import { Clock, Info, Tag } from "lucide-react"
import type { SceneConfig } from "some-types-utils"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "some-ui-shared"

type EditSceneDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  scene: SceneConfig | null
  onSave: (scene: SceneConfig) => void
}

const secondsToMs = (seconds: number) => seconds * 1_000
const msToSeconds = (ms: number) => Math.floor(ms / 1_000)

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export const EditSceneDialog = ({
  open,
  onOpenChange,
  scene,
  onSave,
}: EditSceneDialogProps) => {
  const [sceneName, setSceneName] = useState("")
  const [durationMinutes, setDurationMinutes] = useState("")
  const [durationSeconds, setDurationSeconds] = useState("")

  const [metaTitle, setMetaTitle] = useState("")
  const [metaSubtitle, setMetaSubtitle] = useState("")
  const [metaDescription, setMetaDescription] = useState("")

  useEffect(() => {
    if (!scene) return

    setSceneName(scene.scene_name)
    const totalSeconds = msToSeconds(scene.duration)
    setDurationMinutes(Math.floor(totalSeconds / 60).toString())
    setDurationSeconds((totalSeconds % 60).toString())

    setMetaTitle(scene.metadata?.title ?? "")
    setMetaSubtitle(scene.metadata?.subtitle ?? "")
    setMetaDescription(scene.metadata?.description ?? "")
  }, [scene])

  const minutes = Number.parseInt(durationMinutes, 10) || 0
  const seconds = Number.parseInt(durationSeconds, 10) || 0
  const totalSeconds = minutes * 60 + seconds

  const handleSave = () => {
    if (!scene || !sceneName || totalSeconds <= 0) return

    onSave({
      ...scene,
      scene_name: sceneName,
      duration: secondsToMs(totalSeconds),
      metadata: {
        ...scene.metadata, // preserve unknown keys
        title: metaTitle || undefined,
        subtitle: metaSubtitle || undefined,
        description: metaDescription || undefined,
      },
    })

    onOpenChange(false)
  }

  const hasMetadata = metaTitle || metaSubtitle || metaDescription

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Edit Scene</DialogTitle>
          <DialogDescription>
            Configure scene properties and optional metadata
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="properties" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="properties" className="gap-2">
              <Tag className="h-4 w-4" />
              Properties
            </TabsTrigger>
            <TabsTrigger value="metadata" className="gap-2 relative">
              <Info className="h-4 w-4" />
              Metadata
              {hasMetadata && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="properties" className="space-y-5 pt-4">
            {/* Scene Name */}
            <div className="space-y-2">
              <Label htmlFor="scene-name" className="text-sm font-medium">
                Scene Name
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="scene-name"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                placeholder="e.g., Opening Credits, Act 1"
                className="h-10"
              />
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duration
                <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={durationMinutes}
                      onChange={(e) => {
                        const v = e.target.value
                        if (!v || /^\d+$/.test(v)) setDurationMinutes(v)
                      }}
                      placeholder="0"
                      className="h-10 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      min
                    </span>
                  </div>
                </div>
                <span className="text-muted-foreground">:</span>
                <div className="flex-1">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={durationSeconds}
                      onChange={(e) => {
                        const v = e.target.value
                        const num = Number.parseInt(v, 10)
                        if (!v || (/^\d+$/.test(v) && num <= 59))
                          setDurationSeconds(v)
                      }}
                      placeholder="0"
                      className="h-10 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      sec
                    </span>
                  </div>
                </div>
              </div>
              {totalSeconds > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground" />
                  Total: {formatDuration(totalSeconds)} ({totalSeconds}s)
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="metadata" className="space-y-4 pt-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Metadata is optional supplementary information that can be used
                for display or organizational purposes.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meta-title" className="text-sm font-medium">
                  Title
                </Label>
                <Input
                  id="meta-title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="Display title for this scene"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-subtitle" className="text-sm font-medium">
                  Subtitle
                </Label>
                <Input
                  id="meta-subtitle"
                  value={metaSubtitle}
                  onChange={(e) => setMetaSubtitle(e.target.value)}
                  placeholder="Additional context or tagline"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="meta-description"
                  className="text-sm font-medium"
                >
                  Description
                </Label>
                <Input
                  id="meta-description"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Detailed description or notes"
                  className="h-10"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!sceneName || totalSeconds <= 0}
            className="sm:w-auto"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

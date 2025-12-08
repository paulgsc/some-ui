import { useEffect, useState } from "react"
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
} from "some-ui-shared"

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
  const [scene_name, setSceneName] = useState("")
  const [duration, setDuration] = useState("")

  useEffect(() => {
    if (scene) {
      setSceneName(scene.scene_name)
      setDuration(scene.duration.toString())
    }
  }, [scene])

  const handleSave = () => {
    if (!scene || !scene_name || !duration) return

    onSave({
      scene_name,
      duration: Number.parseInt(duration, 10),
    })
    onOpenChange(false)
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Scene</DialogTitle>
          <DialogDescription>
            Update the scene name and duration. Changes will be applied
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="scene-name">Scene Name</Label>
            <Input
              id="scene-name"
              value={scene_name}
              onChange={(e) => setSceneName(e.target.value)}
              placeholder="Enter scene name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (seconds)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Enter duration"
            />
            {duration && Number.parseInt(duration, 10) > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatDuration(Number.parseInt(duration, 10))}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !scene_name || !duration || Number.parseInt(duration, 10) <= 0
            }
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

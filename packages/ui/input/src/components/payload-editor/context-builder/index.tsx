import { useState } from "react"
import type { Context } from "@input/types/timeline-events"
import { Plus, X } from "lucide-react"
import { Badge, Button, Input, Label, Separator } from "some-ui-shared"

type ContextBuilderProps = {
  value: Context
  onChange: (value: Context) => void
  show: boolean
}

export const ContextBuilder = ({
  value,
  onChange,
  show,
}: ContextBuilderProps) => {
  const [newTagKey, setNewTagKey] = useState("")
  const [newTagValue, setNewTagValue] = useState("")

  if (!show) return null

  const addTag = () => {
    if (newTagKey && newTagValue) {
      onChange({
        ...value,
        tags: { ...value.tags, [newTagKey]: newTagValue },
      })
      setNewTagKey("")
      setNewTagValue("")
    }
  }

  const removeTag = (key: string) => {
    onChange({
      ...value,
      tags: Object.fromEntries(
        Object.entries(value.tags).filter(([k]) => k !== key)
      ),
    })
  }

  const updateTitle = (title: string) => {
    onChange({ ...value, title })
  }

  const updateRevisionTag = (revision_tag: string) => {
    onChange({ ...value, revision_tag: revision_tag || undefined })
  }

  return (
    <div className="space-y-4">
      <Separator />
      <div className="space-y-2">
        <Label>Chapter Context</Label>
        <Input
          value={value.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="Chapter title (e.g., 'Coding Session: React Components')"
        />
      </div>

      <div className="space-y-2">
        <Label>Revision Tag (Optional)</Label>
        <Input
          value={value.revision_tag || ""}
          onChange={(e) => updateRevisionTag(e.target.value)}
          placeholder="e.g., 'goal_met', 'failed', 'updated'"
        />
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            value={newTagKey}
            onChange={(e) => setNewTagKey(e.target.value)}
            placeholder="Key"
            className="flex-1"
          />
          <Input
            value={newTagValue}
            onChange={(e) => setNewTagValue(e.target.value)}
            placeholder="Value"
            className="flex-1"
          />
          <Button variant="outline" size="icon" onClick={addTag}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(value.tags).map(([key, tagValue]) => (
            <Badge key={key} variant="secondary" className="gap-1">
              {key}: {tagValue}
              <X
                className="size-3 cursor-pointer"
                onClick={() => removeTag(key)}
              />
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

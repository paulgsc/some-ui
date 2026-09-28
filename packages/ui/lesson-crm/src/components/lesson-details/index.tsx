import type { JSX } from "react"
import type { LessonForm } from "@lesson-crm/lib/draft"
import { Input, Label } from "@some-ui/shared"

type LessonDetailsProps = {
  form: LessonForm
  tagsText: string
  /** A stored lesson's key is its identity; only a new one's can change. */
  keyLocked: boolean
  /** A new lesson whose key another lesson already has. */
  clashes: boolean
  onForm: (form: LessonForm) => void
  onTags: (typed: string) => void
}

/** The manifest entry learners choose the lesson by. */
export const LessonDetails = ({
  form,
  tagsText,
  keyLocked,
  clashes,
  onForm,
  onTags,
}: LessonDetailsProps): JSX.Element => (
  <div className="grid content-start gap-3 sm:grid-cols-2">
    <div className="flex flex-col gap-1">
      <Label htmlFor="lesson-key">Key</Label>
      <Input
        id="lesson-key"
        value={form.key}
        readOnly={keyLocked}
        onChange={(event) => onForm({ ...form, key: event.target.value })}
        className="font-mono"
      />
      {clashes && (
        <p role="alert" className="text-destructive text-xs">
          A lesson with this key exists. Open it from the list to edit it.
        </p>
      )}
    </div>
    <div className="flex flex-col gap-1">
      <Label htmlFor="lesson-name">Name</Label>
      <Input
        id="lesson-name"
        value={form.displayName}
        onChange={(event) =>
          onForm({ ...form, displayName: event.target.value })
        }
      />
    </div>
    <div className="flex flex-col gap-1 sm:col-span-2">
      <Label htmlFor="lesson-description">Description</Label>
      <Input
        id="lesson-description"
        value={form.description}
        onChange={(event) =>
          onForm({ ...form, description: event.target.value })
        }
      />
    </div>
    <div className="flex flex-col gap-1 sm:col-span-2">
      <Label htmlFor="lesson-tags">
        Tags (yours: relation tags are derived from the probes)
      </Label>
      <Input
        id="lesson-tags"
        value={tagsText}
        placeholder="topik-3, makjang"
        onChange={(event) => onTags(event.target.value)}
      />
    </div>
  </div>
)

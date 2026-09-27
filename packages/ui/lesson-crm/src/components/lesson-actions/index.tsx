import type { JSX } from "react"
import type { OperatorLesson } from "@lesson-crm/lib/client"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { Button } from "@some-ui/shared"
import { Archive, ArchiveRestore, RotateCcw, Save } from "lucide-react"

type LessonActionsProps = {
  save: Intent<unknown>
  listing: Intent<unknown>
  canSave: boolean
  onSave: () => void
  /** The stored lesson, for Retire/Restore; absent for a new one. */
  stored: OperatorLesson | undefined
  onListed: (listed: boolean) => void
}

/**
 * Save, and Retire or Restore. Each button follows its intent: held while it
 * runs, and after a failure it says it will try again (the toast says why).
 */
export const LessonActions = ({
  save,
  listing,
  canSave,
  onSave,
  stored,
  onListed,
}: LessonActionsProps): JSX.Element => {
  const busy = save.status === "working" || listing.status === "working"
  const saveLabel = matchIntent(save, {
    idle: () => "Save",
    working: () => "Saving…",
    succeeded: () => "Save",
    failed: (error) => (error.retryable ? "Try saving again" : "Save"),
  })
  const listed = stored?.retiredAt === null
  const listingLabel = matchIntent(listing, {
    idle: () => (listed ? "Retire" : "Restore"),
    working: () => (listed ? "Retiring…" : "Restoring…"),
    succeeded: () => (listed ? "Retire" : "Restore"),
    failed: (error) =>
      error.retryable
        ? `Try ${listed ? "retiring" : "restoring"} again`
        : listed
          ? "Retire"
          : "Restore",
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="gap-2" disabled={busy || !canSave} onClick={onSave}>
        {save.status === "failed" ? (
          <RotateCcw className="size-4" />
        ) : (
          <Save className="size-4" />
        )}
        {saveLabel}
      </Button>
      {stored && (
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => onListed(!listed)}
        >
          {listed ? (
            <Archive className="size-4" />
          ) : (
            <ArchiveRestore className="size-4" />
          )}
          {listingLabel}
        </Button>
      )}
      {stored && (
        <p className="text-muted-foreground basis-full text-xs">
          Version {stored.version}, published {stored.publishedAt}
          {stored.retiredAt ? `, retired ${stored.retiredAt}` : ""}
        </p>
      )}
    </div>
  )
}

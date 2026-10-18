import type { ChangeEvent, FC } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type {
  PickState,
  SessionFileStore,
} from "@leetype/lib/leetype/session-file-pick"
import { SessionFilePickRuntime } from "@leetype/lib/leetype/session-file-pick"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { FolderOpen } from "lucide-react"

type SessionFilePickerProps = {
  /** Fixed for the card's life: the runtime is made once per mount. */
  store: SessionFileStore
  /** Where the file waits, as the host words it ("In Drive, look in …"). */
  hint?: string
  className?: string
}

function statusOf(pick: PickState): string | null {
  switch (pick.kind) {
    case "idle": {
      return null
    }
    case "reading": {
      return "Reading the file…"
    }
    case "keeping": {
      return `Keeping ${pick.name}…`
    }
    case "refused": {
      return pick.reason
    }
    case "kept": {
      return pick.already
        ? `${pick.title} is already on this phone.`
        : `Kept ${pick.title} on this phone.`
    }
    default: {
      return assertNever(pick)
    }
  }
}

/**
 * "Add a session from storage": the system picker, where Android lists
 * Drive beside the phone's own files, then what the phone holds. A refusal
 * says why; the content lint's findings fold under a kept file. Bounded, so
 * it never takes the round's screen from it.
 */
export const SessionFilePicker: FC<SessionFilePickerProps> = ({
  store,
  hint,
  className,
}) => {
  const [runtime] = useState(() => new SessionFilePickRuntime(store))
  const { held, pick } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => {
    runtime.start()
    return runtime.cancel
  }, [runtime])

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // Cleared, so picking the same file again still reads it.
    event.target.value = ""
    if (file) runtime.pick(file)
  }
  const status = statusOf(pick)
  const card =
    // scroll-intent: reading-page: the held list and a file's findings can
    // outgrow a phone held sideways; the card scrolls inside its cap.
    "flex max-h-[40%] flex-col gap-2 overflow-y-auto px-4 py-3"

  return (
    <section
      aria-label="Session files"
      data-scroll-intent="reading-page"
      className={cn(card, className)}
    >
      <Button asChild variant="outline" size="sm" className="self-start">
        <label className="cursor-pointer">
          <FolderOpen aria-hidden />
          Add a session from storage
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onPick}
          />
        </label>
      </Button>
      {hint !== undefined && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
      {status !== null && (
        <p
          role={pick.kind === "refused" ? "alert" : "status"}
          className={cn(
            "text-pretty text-sm",
            pick.kind === "refused" && "text-destructive"
          )}
        >
          {status}
        </p>
      )}
      {pick.kind === "kept" && pick.findings.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            The content lint found something; the session still plays
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {pick.findings.map((finding) => (
              <li key={`${finding.code} ${finding.screen} ${finding.message}`}>
                {finding.screen}: {finding.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {held.kind === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {held.summary}
        </p>
      )}
      {held.kind === "ready" && held.files.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            On this phone ({held.files.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {held.files.map((file) => (
              <li key={file.name}>
                <span className="font-medium">{file.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {file.name}: {file.oneLine}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

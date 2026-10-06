import type { ChangeEvent, ClipboardEvent, DragEvent, JSX } from "react"
import { useState } from "react"
import type { Draft } from "@lesson-crm/lib/draft"
import type { LessonSource } from "@lesson-crm/lib/source"
import { formatSize } from "@lesson-crm/lib/source"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { ClipboardPaste, FileJson, Upload, X } from "lucide-react"

type LessonSourcePaneProps = {
  source: LessonSource | null
  draft: Draft | null
  onText: (text: string) => void
  onFile: (file: File) => void
  onClear: () => void
  /** Reads the clipboard, where the page may (a secure context). */
  onPasteButton: () => void
  canReadClipboard: boolean
}

const ORIGIN_WORDS: Record<LessonSource["origin"], string> = {
  pasted: "Pasted",
  uploaded: "Uploaded",
  stored: "On the server",
}

/**
 * Where a lesson comes in - paste, drop or upload - and what shows is the
 * file it became, never its text. The preview is how a lesson is read; the
 * JSON is for the machine.
 *
 * The paste target is an editable box that is always empty: a phone can only
 * paste into something editable, and on plain `http://` there is no
 * clipboard API to read from instead. Whatever lands in it becomes a file at
 * once.
 */
export const LessonSourcePane = ({
  source,
  draft,
  onText,
  onFile,
  onClear,
  onPasteButton,
  canReadClipboard,
}: LessonSourcePaneProps): JSX.Element => {
  const [over, setOver] = useState(false)

  const take = (file: File | undefined, text: string): void => {
    if (file) onFile(file)
    else if (text.trim() !== "") onText(text)
  }

  const paste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    event.preventDefault()
    take(event.clipboardData.files[0], event.clipboardData.getData("text"))
  }

  const drop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files[0], event.dataTransfer.getData("text"))
  }

  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) onFile(file)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {source && (
        <div
          data-slot="lesson-file"
          className="border-border flex shrink-0 items-center gap-3 rounded-xl border p-3"
        >
          <FileJson className="text-primary size-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {source.file.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {ORIGIN_WORDS[source.origin]} · {formatSize(source.file.size)}
              {draft?.ok
                ? ` · ${draft.intake.meta.batchCount} conversations`
                : draft
                  ? " · not a lesson yet"
                  : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove the lesson"
            onClick={onClear}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "border-border text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-sm",
          over && "border-primary bg-primary/5"
        )}
      >
        <FileJson className="size-6" />
        <span>
          {source ? "To replace it, paste" : "Paste"} the model&apos;s whole
          reply here, or drop a lesson file.
        </span>
        <textarea
          aria-label="Paste the lesson here"
          value=""
          onChange={(event) => {
            // Text that arrives some other way than a paste event (a
            // keyboard's clipboard strip, an autofill) is taken the same.
            if (event.target.value.trim() !== "") onText(event.target.value)
          }}
          onPaste={paste}
          rows={1}
          placeholder="Tap and hold to paste"
          className="border-border bg-background field-sizing-fixed w-full max-w-xs resize-none rounded-md border px-2 py-1 text-center text-xs"
        />
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {canReadClipboard && (
          <Button variant="outline" className="gap-2" onClick={onPasteButton}>
            <ClipboardPaste className="size-4" /> Paste from clipboard
          </Button>
        )}
        <Button variant="outline" className="gap-2" asChild>
          <label>
            <Upload className="size-4" /> Upload a file
            <input
              type="file"
              accept=".json,.txt,.md,application/json,text/plain"
              className="sr-only"
              onChange={upload}
            />
          </label>
        </Button>
      </div>
    </div>
  )
}

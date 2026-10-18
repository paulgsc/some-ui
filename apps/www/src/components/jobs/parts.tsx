/**
 * Pieces the Jobs screens share. Each reads the phone's jobs runtime
 * (`@/lib/jobs`) and forwards taps to it; none decides anything. Phone-only
 * (`build.paths.ts`): render behind an inline `VITE_DEVICE_BACKEND`.
 */
import type { ChangeEvent, JSX, ReactNode } from "react"
import { useSyncExternalStore } from "react"
import { cn, formatTimecode } from "@some-ui/core-utils"
import type { ResumeRecommendation } from "@some-ui/job-desk"
import { Button, useConfirmSheet } from "@some-ui/shared"
import { FolderOpen, Mic, Square } from "lucide-react"

import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { JobsSnapshot } from "@/lib/jobs"
import { copyText, phoneJobs } from "@/lib/jobs"
import type { ShareKind } from "@/lib/jobs/model"
import { lookIn } from "@/lib/share-files"

export function useJobs(): JobsSnapshot {
  const jobs = phoneJobs()
  return useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
}

export const sectionHeading =
  "text-muted-foreground text-xs font-semibold tracking-wider uppercase"

/** A 0–1 score as a bar and its value. */
export const Meter = ({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "fit" | "odds"
}): JSX.Element => (
  <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-xs tabular-nums">
    <span>{label}</span>
    <span className="bg-muted h-1.5 overflow-hidden rounded-full">
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "fit" ? "bg-emerald-600" : "bg-amber-500"
        )}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
    <span className="text-right">{value.toFixed(2)}</span>
  </div>
)

export function resumeLabel(resume: ResumeRecommendation): string {
  return resume.kind === "build"
    ? `Build · ${resume.variant} · ${resume.template}`
    : `Patch · ${resume.variant}${resume.pr === null ? " (proposed)" : ` · PR #${resume.pr}`}`
}

export const CopyButton = ({
  text,
  what,
}: {
  text: string
  what: string
}): JSX.Element => {
  const copy = useAsyncIntent(() => copyText(text), {
    presentation: "interactive",
  })
  return (
    <IntentButton
      state={copy.state}
      onPress={() => copy.start(undefined)}
      variant="outline"
      size="sm"
      idleLabel="Copy"
      workingLabel="Copying…"
      succeededLabel="Copied"
      title={`Copy ${what}`}
    />
  )
}

/** Toggle chips: each pressed or not, in the order given. */
export const Chips = <T extends string>({
  label,
  options,
  pressed,
  onToggle,
}: {
  label: string
  options: ReadonlyArray<readonly [T, string]>
  pressed: (value: T) => boolean
  onToggle: (value: T) => void
}): JSX.Element => {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([value, text]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          className="rounded-full"
          variant={pressed(value) ? "default" : "outline"}
          aria-pressed={pressed(value)}
          onClick={() => onToggle(value)}
        >
          {text}
        </Button>
      ))}
    </div>
  )
}

/**
 * A minute-long voice note for `owner`, and the notes it already has. A note
 * stays on the phone until the share it goes out in arrives.
 */
export const VoiceNotes = ({
  owner,
  notes,
  hint,
}: {
  owner: string
  notes: ReadonlyArray<{ id: string; durationMs: number }>
  hint: string
}): JSX.Element => {
  const { take, takeOwner, said } = useJobs()
  const jobs = phoneJobs()
  const mine = takeOwner === owner
  const busy = take.kind !== "idle"
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant={
            mine && take.kind === "recording" ? "secondary" : "destructive"
          }
          className="rounded-full"
          disabled={busy && !mine}
          aria-label={mine && busy ? "Stop recording" : "Record a voice note"}
          onClick={() =>
            mine && busy ? jobs.stopVoice() : jobs.startVoice(owner)
          }
        >
          {mine && busy ? <Square aria-hidden /> : <Mic aria-hidden />}
        </Button>
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-sm tabular-nums">
            {mine && take.kind === "recording"
              ? `${formatTimecode(take.elapsedMs)} / 1:00`
              : notes.length > 0
                ? `${notes.length} voice note${notes.length > 1 ? "s" : ""}`
                : hint}
          </span>
          <span className="text-muted-foreground text-xs">
            {mine && said
              ? said
              : "Shared to Drive with the day’s files, never sent home."}
          </span>
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {notes.map((n, i) => (
            <li key={n.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => jobs.dropVoice([n.id])}
                aria-label={`Let voice note ${i + 1} go`}
              >
                {`Note ${i + 1} · ${formatTimecode(n.durationMs)} ×`}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The system picker: Android lists Drive beside the phone's own files. */
export const OpenDigest = ({
  prominent,
}: {
  prominent: boolean
}): JSX.Element => {
  const { importing } = useJobs()
  const where = lookIn("job-digest")
  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // Cleared, so picking the same file again still reads it.
    event.target.value = ""
    if (file) phoneJobs().open(file)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        asChild
        variant={prominent ? "default" : "outline"}
        size={prominent ? "lg" : "sm"}
      >
        <label className="cursor-pointer">
          <FolderOpen aria-hidden />
          {importing.kind === "reading"
            ? "Reading…"
            : "Open today’s picks from storage"}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onPick}
          />
        </label>
      </Button>
      {where && (
        <span className="text-muted-foreground text-xs">
          In Drive, look in {where}
        </span>
      )}
      {importing.kind === "rejected" && (
        <p role="alert" className="text-destructive text-sm">
          {importing.problem}
        </p>
      )}
    </div>
  )
}

/**
 * Shares `kind`'s new file and its voice notes, then asks whether they
 * arrived: only then does their audio leave the phone.
 */
export const ShareToDrive = ({
  kind,
  label,
  children,
}: {
  kind: ShareKind
  label: string
  children?: ReactNode
}): JSX.Element => {
  // Read for its re-render: what is new to share changes with the record.
  useJobs()
  const jobs = phoneJobs()
  const outgoing = jobs.outgoing(kind)
  const share = useAsyncIntent(() => jobs.share(kind), {
    presentation: "interactive",
  })
  const { ask, sheet } = useConfirmSheet()
  useIntentEffect(share, (shared) => {
    if (shared.outcome !== "shared") return
    ask({
      title: "Did they arrive?",
      description:
        "Once they have, the voice notes that went out can leave the phone. What you decided stays.",
      confirm: "They arrived",
      keep: "Keep them here",
      onConfirm: () => jobs.arrived(shared.shareId),
    })
  })
  return (
    <section className="flex flex-col gap-2">
      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        disabled={outgoing === null}
        size="lg"
        idleLabel={label}
        workingLabel="Sharing…"
      />
      <p className="text-muted-foreground text-xs">
        {outgoing === null
          ? "Nothing new to share."
          : `${outgoing.name}${outgoing.voice.length > 0 ? ` and ${outgoing.voice.length} voice note${outgoing.voice.length > 1 ? "s" : ""}` : ""}.`}
      </p>
      {children}
      {sheet}
    </section>
  )
}

/** What the record refused to keep, said once. */
export const Problem = (): JSX.Element | null => {
  const { problem } = useJobs()
  return problem ? (
    <p role="alert" className="text-destructive text-sm">
      {problem}
    </p>
  ) : null
}

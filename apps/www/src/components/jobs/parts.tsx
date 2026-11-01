/**
 * Pieces the Jobs screens share. Each reads the phone's jobs runtime
 * (`@/lib/jobs`) and forwards taps to it; none decides anything. The Jobs
 * screens are phone-only (`build.paths.ts`): render them behind an inline
 * `VITE_DEVICE_BACKEND`.
 */
import type { ChangeEvent, JSX, ReactNode } from "react"
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react"
import { Button, TakeList, useTakePattern } from "@some-ui/shared"
import { FolderOpen } from "lucide-react"

import type { JobsSnapshot } from "@/lib/jobs"
import { phoneJobs } from "@/lib/jobs"
import type { JourneyContext } from "@/lib/jobs/journey"
import type { ShareKind } from "@/lib/jobs/model"
import { formTakes } from "@/lib/jobs/model"
import { openFromDrive, voiceGoesHome } from "@/lib/jobs/words"
import type { Journey, Noun } from "@/lib/journey"
import { lookIn } from "@/lib/share-files"
import { journeyBarState, StatusCard } from "@/components/journey-status"

export function useJobs(): JobsSnapshot {
  const jobs = phoneJobs()
  return useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
}

/** Whether `owner`'s voice note is still opening, recording or being kept. */
export function useVoiceBusy(owner: string): boolean {
  const { take, answers } = useTakePattern(phoneJobs().voice)
  return take.kind !== "idle" && answers === owner
}

/**
 * The home network's résumé builder, a page of the lan build, as an
 * absolute URL: another deployable's, which Capacitor opens in the phone's
 * browser. The Android app bundles no résumé build and holds no
 * contact details.
 */
const RESUME_BUILDER = "https://www.home.maishatu.com/resume-build"

/** The builder with a composition and layout preselected, for pick or scout `id`. */
export function builderHref(
  sends: { variant: string; template: string },
  id: string
): string {
  return `${RESUME_BUILDER}?${new URLSearchParams({
    variant: sends.variant,
    template: sends.template,
    pick: id,
  }).toString()}`
}

/** Toggle chips: each pressed or not, in the order given. */
export const Chips = <T extends string>({
  label,
  options,
  pressed,
  onToggle,
  disabled,
}: {
  label: string
  options: ReadonlyArray<readonly [T, ReactNode]>
  pressed: (value: T) => boolean
  onToggle: (value: T) => void
  disabled?: (value: T) => boolean
}): JSX.Element => {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([value, text]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          className="gap-1.5 rounded-full"
          variant={pressed(value) ? "default" : "outline"}
          aria-pressed={pressed(value)}
          disabled={disabled?.(value)}
          onClick={() => onToggle(value)}
        >
          {text}
        </Button>
      ))}
    </div>
  )
}

/**
 * `owner`'s voice notes on the take pattern's parts: tap to talk, tap to
 * keep, then each note's row with Play, Redo and Let it go. Many a form,
 * each a minute at most (`JOB_VOICE_OPTIONS`). A note goes home with what
 * it is added to; Let go sets it aside, kept on this phone (D3), and Redo
 * keeps the one it records again (D2), neither added to the form.
 */
export const VoiceNotes = ({
  owner,
  hint,
}: {
  owner: string
  /** What the form's notes are for, said under them. */
  hint: string
}): JSX.Element => {
  const { state } = useJobs()
  const { voice } = phoneJobs()
  // Leaving the form ends its note under way rather than recording on.
  useEffect(
    () => (): void => {
      if (voice.getSnapshot().answers === owner) voice.leave()
    },
    [voice, owner]
  )
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
      <TakeList
        pattern={voice}
        answers={owner}
        takes={formTakes(state, owner)}
        label="Voice notes"
      />
      <p className="text-muted-foreground text-xs">
        {hint}. {voiceGoesHome}
      </p>
    </div>
  )
}

/** The system picker: Android lists Drive beside the phone's own files. */
export const OpenDigest = (): JSX.Element => {
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
      <Button asChild variant="outline" size="sm">
        <label className="cursor-pointer">
          <FolderOpen aria-hidden />
          {importing.kind === "reading" ? "Reading…" : openFromDrive}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onPick}
          />
        </label>
      </Button>
      {where && <span className="text-muted-foreground text-xs">{where}</span>}
      {importing.kind === "rejected" && (
        <p role="alert" className="text-destructive text-sm">
          {importing.problem}
        </p>
      )}
    </div>
  )
}

/**
 * Whether this phone is paired with home, as the wing's layout reads it
 * (`usePairedWithHome`): only then does an exchange file the cards' files.
 */
const KeptOnHomeContext = createContext(false)

export const KeptOnHome = KeptOnHomeContext.Provider

/**
 * What the Jobs cards read their state from (`lib/jobs/journey`); `kept`
 * where a page outside the wing knows it, the wing's layout's otherwise.
 */
export function useJourneyContext(kept?: boolean): JourneyContext {
  const { state } = useJobs()
  const wing = useContext(KeptOnHomeContext)
  return { state, kept: kept ?? wing, outgoing: phoneJobs().keeping.outgoing }
}

/** A card whose title bar wears where its file is, and what it holds. */
export const JourneyCard = ({
  title,
  journey,
  noun,
  heading,
  children,
}: {
  title: ReactNode
  journey: Journey | null
  noun: Noun
  heading?: "h2" | "h3"
  children?: ReactNode
}): JSX.Element => (
  <StatusCard
    title={title}
    state={journeyBarState(journey, noun, new Date())}
    heading={heading}
  >
    {children}
  </StatusCard>
)

/**
 * Why `kind`'s file can't be filed, when the record holds something the
 * morning run couldn't read; nothing otherwise.
 */
export const FileProblem = ({
  kind,
}: {
  kind: ShareKind
}): JSX.Element | null => {
  // Read again whenever the record changes.
  useJobs()
  const outgoing = phoneJobs().keeping.outgoing(kind)
  if (outgoing === null || !("problem" in outgoing)) return null
  return (
    <p role="alert" className="text-destructive px-3.5 pb-3.5 text-sm">
      {outgoing.problem}
    </p>
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

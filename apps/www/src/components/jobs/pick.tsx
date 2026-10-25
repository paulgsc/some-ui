/**
 * Jobs › a pick: Read, Decide, Résumé, Apply, Ending. Opening the reading
 * records that I read it, once a day, and moves nothing; each later step adds
 * one event to the record. The step shown follows the record, and any step
 * already reached can be looked at again. Apply stays the step shown until the
 * ending is kept, and each form's text is a draft the runtime keeps, so
 * leaving the app to apply, or halfway through a form, loses nothing (JB1).
 */
import type { JSX } from "react"
import { useEffect, useState } from "react"
import { cn } from "@some-ui/core-utils"
import type { Kit, Pick } from "@some-ui/job-desk"
import {
  DEBRIEF_RESULTS,
  FRICTION,
  MAX_DEBRIEF_MINUTES,
  MAX_NOTE,
  pacificDay,
  PASS_REASONS,
} from "@some-ui/job-desk"
import { Badge, Button, Input, Label, Textarea } from "@some-ui/shared"
import { ExternalLink } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { phoneJobs } from "@/lib/jobs"
import type { DebriefDraft, PassDraft } from "@/lib/jobs/drafts"
import { draftOf } from "@/lib/jobs/drafts"
import type { JobsState, PickRef } from "@/lib/jobs/model"
import {
  decisionOf,
  digestOf,
  draftVoice,
  fitNoteSays,
  fitNotesOf,
  kitOf,
  pickOwner,
  progressOf,
  standingOf,
  timedMinutes,
} from "@/lib/jobs/model"
import {
  addHowItWent,
  archivedIt,
  decideHint,
  dontClaim,
  endedAs,
  endingLabels,
  fitWord,
  frictionHeading,
  frictionLabels,
  frictionScale,
  howDidItEnd,
  howItWentHint,
  howLong,
  inAFewWords,
  lapsedOn,
  minutesRange,
  notForMe,
  notForMeWithWhy,
  onToDecide,
  passedIt,
  passLabels,
  sayItAloud,
  sayWhyAloud,
  sayWhyNot,
  sendAfterAll,
  sendIt,
  steps,
  whatGotInTheWay,
  whatHappened,
  whatTheyWant,
  whereIFit,
  whyNot,
} from "@/lib/jobs/words"
import {
  Gaps,
  postingLine,
  resumeLabel,
  sectionHeading,
} from "@/components/job-reading"

import {
  builderHref,
  Chips,
  CopyButton,
  Problem,
  useJobs,
  useVoiceBusy,
  VoiceNotes,
} from "./parts"

const EMPTY_DEBRIEF: DebriefDraft = {
  form: "debrief",
  minutes: null,
  friction: null,
  chips: [],
  what: "",
}

/** A step's pick, and what moves the screen on once it records. */
type StepProps = { pickRef: PickRef; advance: () => void }

function toggle<T>(list: ReadonlyArray<T>, value: T): Array<T> {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

/** What the posting wants and where I fit, in words, with no verdict asked. */
const Read = ({
  pick,
  pickRef,
  onNext,
}: {
  pick: Pick
  pickRef: PickRef
  onNext: () => void
}): JSX.Element => {
  const { day, pickId, fingerprint } = pickRef
  useEffect(() => {
    phoneJobs().read({ day, pickId, fingerprint })
  }, [day, pickId, fingerprint])
  return (
    <div className="flex flex-col gap-4">
      <section className="bg-muted flex flex-col gap-1 rounded-xl p-3">
        <span className="text-sm font-semibold">
          {fitWord(pick.scores.fit)}
        </span>
        <span className="text-sm">{pick.scores.fitWhy}</span>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={sectionHeading}>{whatTheyWant}</h3>
        <p className="text-sm leading-relaxed">{pick.wants}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>{whereIFit}</h3>
        <ul className="flex flex-col gap-2">
          {pick.fits.map((fit) => (
            <li
              key={fit.title}
              className="bg-muted flex flex-col gap-0.5 rounded-xl p-3"
            >
              <span className="text-sm font-semibold">{fit.title}</span>
              <span className="text-sm">{fit.detail}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {fit.source}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Gaps gaps={pick.gaps} />
      {pick.dontClaim.length > 0 && (
        <section className="border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-xl border p-3">
          <h3 className={cn(sectionHeading, "text-destructive")}>
            {dontClaim}
          </h3>
          <p className="text-sm">{pick.dontClaim.join(" · ")}</p>
        </section>
      )}
      <Button type="button" size="lg" variant="outline" onClick={onNext}>
        {onToDecide}
      </Button>
    </div>
  )
}

const Decide = ({
  state,
  pickRef,
  advance,
}: {
  state: JobsState
  pickRef: PickRef
  advance: () => void
}): JSX.Element => {
  const jobs = phoneJobs()
  const owner = pickOwner(pickRef.day, pickRef.pickId, "pass")
  const draft = draftOf(useJobs().drafts, owner, "pass")
  const saying = draft !== null
  const reasons = draft?.reasons ?? []
  const note = draft?.note ?? ""
  const keep = (change: Partial<Omit<PassDraft, "form">>): void => {
    jobs.draft(owner, { form: "pass", reasons, note, ...change })
  }
  const voice = draftVoice(state, owner)
  const busy = useVoiceBusy(owner)
  const today = pacificDay(useMinuteClock())
  const decision = decisionOf(state, pickRef.day, pickRef.pickId)
  const standing = standingOf(state, pickRef.day, pickRef.pickId, today)
  const send = (): void => {
    if (jobs.record({ type: "taken", ...pickRef })) advance()
  }
  const pass = (): void => {
    if (busy) return
    const kept = jobs.record({
      type: "passed",
      ...pickRef,
      reasons,
      note: note.trim(),
      voice: voice.map((v) => v.id),
    })
    if (kept) advance()
  }
  if (decision === "passed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="bg-muted rounded-xl p-3 text-sm">{passedIt}</p>
        <Button type="button" variant="outline" onClick={send}>
          {sendAfterAll}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {decision === "archived" && (
        <p className="bg-muted rounded-xl p-3 text-sm">{archivedIt}</p>
      )}
      {standing.kind === "lapsed" && (
        <p className="bg-muted rounded-xl p-3 text-sm">
          {lapsedOn(standing.on)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="lg" onClick={send}>
          {sendIt}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={pass}
        >
          {notForMe}
        </Button>
      </div>
      {saying ? (
        <section className="flex flex-col gap-3">
          <h3 className={sectionHeading}>{whyNot}</h3>
          <Chips
            label={whyNot}
            options={PASS_REASONS.map((r) => [r, passLabels[r]] as const)}
            pressed={(r) => reasons.includes(r)}
            onToggle={(r) => keep({ reasons: toggle(reasons, r) })}
          />
          <Label htmlFor="pass-note" className={sectionHeading}>
            {inAFewWords}
          </Label>
          <Textarea
            id="pass-note"
            rows={2}
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => keep({ note: e.target.value })}
          />
          <VoiceNotes owner={owner} notes={voice} hint={sayWhyAloud} />
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={pass}
          >
            {notForMeWithWhy}
          </Button>
        </section>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{decideHint}</p>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => keep({})}
          >
            {sayWhyNot}
          </Button>
        </>
      )}
    </div>
  )
}

const Resume = ({
  pick,
  pickRef,
  advance,
}: StepProps & { pick: Pick }): JSX.Element => {
  const { resume } = pick
  const build =
    resume.kind === "build"
      ? resume
      : { variant: resume.fallback, template: resume.template }
  const href = builderHref(build, pick.id)
  return (
    <div className="flex flex-col gap-4">
      {resume.kind === "build" ? (
        <section className="flex flex-col gap-1 rounded-xl border p-3">
          <span className="font-semibold">Build this one</span>
          <span className="text-muted-foreground text-sm">
            {resume.variant} · {resume.template}, as of some-ui {resume.ref}.
          </span>
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              The run proposes a {resume.variant} résumé
            </span>
            <Badge variant="secondary">
              {resume.pr === null ? "proposed" : `PR #${resume.pr}`}
            </Badge>
          </div>
          <p className="text-sm">{resume.change}</p>
          {resume.pr !== null && (
            <Button asChild variant="outline" size="sm" className="self-start">
              <a
                href={`https://github.com/paulgsc/some-ui/pull/${resume.pr}`}
                target="_blank"
                rel="noreferrer"
              >
                Review the PR <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
          <span className="text-muted-foreground text-xs">
            Until it lands, send {resume.fallback} · {resume.template}.
          </span>
        </section>
      )}
      <Button asChild size="lg">
        <a href={href} target="_blank" rel="noreferrer">
          Build with my details <ExternalLink aria-hidden />
        </a>
      </Button>
      <p className="text-muted-foreground text-xs">
        Opens the résumé builder in your browser, on the home network, with your
        passkey. Save the PDF you send in Drive › some-ui jobs › Recommended
        resume.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (phoneJobs().record({ type: "resume-ready", ...pickRef }))
            advance()
        }}
      >
        I have the PDF
      </Button>
    </div>
  )
}

/**
 * What the run drafted from the posting's own form (ROUTINE.md §7): the
 * cover letter, each free-text question as the form words it, and the pay
 * expectation.
 */
export const KitDrafts = ({
  kit,
  redraftedOn = null,
}: {
  kit: Kit
  /** The digest day a redraft came from, when one did. */
  redraftedOn?: string | null
}): JSX.Element | null => {
  const { coverLetter, questions, compensation } = kit
  if (coverLetter === null && questions.length === 0 && compensation === null)
    return null
  return (
    <section className="flex flex-col gap-3">
      <h3 className={sectionHeading}>Drafts for the form</h3>
      {redraftedOn !== null && (
        <p className="text-muted-foreground text-xs">
          Redrafted from my fit notes in the {redraftedOn} digest.
        </p>
      )}
      {coverLetter !== null && (
        <Draft label="Cover letter" draft={coverLetter} />
      )}
      {questions.map((question) => (
        <Draft
          key={question.label}
          label={question.label}
          draft={question.draft}
          required={question.required}
        />
      ))}
      {compensation !== null && (
        <Draft
          label="Pay expectation"
          draft={compensation.ask}
          note={compensation.why}
        />
      )}
    </section>
  )
}

const Draft = ({
  label,
  draft,
  required = false,
  note,
}: {
  label: string
  draft: string | null
  required?: boolean
  /** Why the run drafted it so, under the draft. */
  note?: string
}): JSX.Element => (
  <div className="flex flex-col gap-2 rounded-xl border p-3">
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground min-w-0 flex-1 text-xs">
        {label}
      </span>
      {required && <Badge variant="outline">Required</Badge>}
    </span>
    {draft === null ? (
      <p className="text-muted-foreground text-sm">
        No draft: this one is mine.
      </p>
    ) : (
      <>
        <p className="text-sm leading-relaxed whitespace-pre-line select-all">
          {draft}
        </p>
        {note !== undefined && (
          <p className="text-muted-foreground text-xs">{note}</p>
        )}
        <CopyButton text={draft} what={label} />
      </>
    )}
  </div>
)

const Apply = ({
  state,
  pick,
  pickRef,
  onDone,
}: {
  state: JobsState
  pick: Pick
  pickRef: PickRef
  /** Goes on to the debrief, once the posting has been opened. */
  onDone: (() => void) | null
}): JSX.Element => {
  const { kit, redraftedOn } = kitOf(state, pickRef.day, pick)
  const rows = [...kit.fields, ...kit.answers]
  return (
    <div className="flex flex-col gap-4">
      <Button asChild size="lg">
        <a
          href={pick.posting.applyUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            phoneJobs().record({ type: "apply-opened", ...pickRef })
          }}
        >
          Open the posting <ExternalLink aria-hidden />
        </a>
      </Button>
      <p className="text-muted-foreground text-xs">
        Everything below stays here while you fill in their form.
      </p>
      {rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionHeading}>Paste kit</h3>
          <ul className="divide-y rounded-xl border">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-3 px-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-muted-foreground text-xs">
                    {row.label}
                  </span>
                  <span className="break-words select-all">{row.value}</span>
                </span>
                <CopyButton text={row.value} what={row.label} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <KitDrafts kit={kit} redraftedOn={redraftedOn} />
      <FitNote state={state} pickRef={pickRef} />
      {onDone !== null && (
        <Button type="button" size="lg" variant="outline" onClick={onDone}>
          Done with their form
        </Button>
      )}
    </div>
  )
}

/** Why I fit this pick: the next run redrafts it (ROUTINE.md §2). */
const FitNote = ({
  state,
  pickRef,
}: {
  state: JobsState
  pickRef: PickRef
}): JSX.Element | null => {
  const jobs = phoneJobs()
  const owner = pickOwner(pickRef.day, pickRef.pickId, "fit")
  const note = draftOf(useJobs().drafts, owner, "fit")?.note ?? ""
  const voice = draftVoice(state, owner)
  const busy = useVoiceBusy(owner)
  const kept = fitNotesOf(state, pickRef.day, pickRef.pickId).length
  const empty = !fitNoteSays(note, voice)
  if (progressOf(state, pickRef.day, pickRef.pickId).kind !== "open")
    return null
  return (
    <section className="flex flex-col gap-2">
      <Label htmlFor="fit-note" className={sectionHeading}>
        Why I fit it
      </Label>
      <p id="fit-note-hint" className="text-muted-foreground text-xs">
        Say what the posting leaves out. It goes with today’s decisions, and the
        next run redrafts the cover letter and answers from it.
      </p>
      <Textarea
        id="fit-note"
        aria-describedby="fit-note-hint"
        rows={3}
        maxLength={MAX_NOTE}
        value={note}
        onChange={(e) =>
          jobs.draft(owner, { form: "fit", note: e.target.value })
        }
      />
      <VoiceNotes
        owner={owner}
        notes={voice}
        hint="Or say it, up to a minute"
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy || empty}
        onClick={() => {
          if (busy || empty) return
          jobs.record({
            type: "fit-note",
            ...pickRef,
            note: note.trim(),
            voice: voice.map((v) => v.id),
          })
        }}
      >
        Keep it for the next run
      </Button>
      <p role="status" className="text-muted-foreground text-xs">
        {kept === 0
          ? ""
          : `${kept === 1 ? "One fit note" : `${kept} fit notes`} kept for this pick.`}
      </p>
    </section>
  )
}

/**
 * How applying ended, in one tap. How long it took, the friction, what got in
 * the way and what happened are kept with it only once I open them; the timed
 * minutes are offered there, never sent unseen.
 */
const Ending = ({
  state,
  pickRef,
  advance,
}: StepProps & { state: JobsState }): JSX.Element => {
  const jobs = phoneJobs()
  const now = useMinuteClock()
  const timed = timedMinutes(state, pickRef.day, pickRef.pickId, now)
  const owner = pickOwner(pickRef.day, pickRef.pickId, "debrief")
  const draft = draftOf(useJobs().drafts, owner, "debrief")
  const adding = draft !== null
  const { minutes, friction, chips, what } = draft ?? EMPTY_DEBRIEF
  const shownMinutes = minutes ?? (timed === null ? "" : String(timed))
  // The minutes on show are kept with the first change, so the clock moving
  // on can't empty them mid-form.
  const keep = (change: Partial<Omit<DebriefDraft, "form">>): void => {
    jobs.draft(owner, {
      ...EMPTY_DEBRIEF,
      ...draft,
      minutes: shownMinutes,
      ...change,
    })
  }
  const voice = draftVoice(state, owner)
  const busy = useVoiceBusy(owner)
  const parsedMinutes = Number.parseInt(shownMinutes, 10)
  const minutesFit = parsedMinutes >= 1 && parsedMinutes <= MAX_DEBRIEF_MINUTES
  const said = adding && shownMinutes.trim() !== ""
  const ready = !busy && (!said || minutesFit)
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>{howDidItEnd}</h3>
        {DEBRIEF_RESULTS.map((result) => (
          <Button
            key={result}
            type="button"
            size="lg"
            variant={result === "submitted" ? "default" : "outline"}
            disabled={!ready}
            onClick={() => {
              if (!ready) return
              const kept = jobs.record({
                type: "debrief",
                ...pickRef,
                minutes: said ? parsedMinutes : null,
                friction,
                chips,
                what: what.trim(),
                voice: voice.map((v) => v.id),
                result,
              })
              if (kept) advance()
            }}
          >
            {endingLabels[result]}
          </Button>
        ))}
      </section>
      {adding ? (
        <>
          <p className="text-muted-foreground text-xs">{howItWentHint}</p>
          <section className="flex flex-col gap-2">
            <Label htmlFor="debrief-minutes" className={sectionHeading}>
              {howLong}
            </Label>
            <Input
              id="debrief-minutes"
              inputMode="numeric"
              className="w-28"
              value={shownMinutes}
              onChange={(e) => keep({ minutes: e.target.value })}
            />
            {said && !minutesFit && (
              <span className="text-muted-foreground text-xs">
                {minutesRange(MAX_DEBRIEF_MINUTES)}
              </span>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className={sectionHeading}>{frictionHeading}</h3>
            <div
              role="group"
              aria-label={frictionHeading}
              className="grid grid-cols-5 gap-2"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={friction === n ? "default" : "outline"}
                  aria-pressed={friction === n}
                  onClick={() => keep({ friction: friction === n ? null : n })}
                >
                  {n}
                </Button>
              ))}
            </div>
            <span className="text-muted-foreground text-xs">
              {frictionScale}
            </span>
            <Chips
              label={whatGotInTheWay}
              options={FRICTION.map((c) => [c, frictionLabels[c]] as const)}
              pressed={(c) => chips.includes(c)}
              onToggle={(c) => keep({ chips: toggle(chips, c) })}
            />
          </section>
          <section className="flex flex-col gap-2">
            <Label htmlFor="debrief-what" className={sectionHeading}>
              {whatHappened}
            </Label>
            <Textarea
              id="debrief-what"
              rows={3}
              maxLength={MAX_NOTE}
              value={what}
              onChange={(e) => keep({ what: e.target.value })}
            />
            <VoiceNotes owner={owner} notes={voice} hint={sayItAloud} />
          </section>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => keep({})}
        >
          {addHowItWent}
        </Button>
      )}
    </div>
  )
}

export const PickFlow = ({
  day,
  pickId,
}: {
  day: string
  pickId: string
}): JSX.Element => {
  const { state } = useJobs()
  const [viewed, setViewed] = useState<number | null>(null)
  const pick = digestOf(state, day)?.picks.find((p) => p.id === pickId)
  if (!pick) {
    return (
      <p className="text-muted-foreground py-6">
        This pick isn’t on the phone. Open its digest from Today.
      </p>
    )
  }
  const pickRef = { day, pickId, fingerprint: pick.fingerprint }
  const progress = progressOf(state, day, pickId)
  const reached =
    progress.kind === "open"
      ? Math.max(progress.step, 1)
      : progress.kind === "passed" || progress.kind === "archived"
        ? 1
        : 4
  const current =
    progress.kind === "open" ? Math.min(progress.step, 3) : reached
  const shown = Math.min(viewed ?? current, reached)
  // Once a step records, the screen follows the record again.
  const follow = (): void => setViewed(null)
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl leading-tight font-bold">
          {pick.posting.title}
        </h2>
        <span className="text-muted-foreground text-sm">
          {postingLine(pick.posting)}
        </span>
        <span className="text-xs">{resumeLabel(pick.resume)}</span>
      </header>
      <nav aria-label="Steps" className="grid grid-cols-5 gap-1">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={i > reached}
            aria-current={i === shown ? "step" : undefined}
            onClick={() => setViewed(i)}
            className={cn(
              "border-t-4 py-1.5 text-[11px] font-semibold disabled:opacity-50",
              progress.kind !== "open" || i < progress.step
                ? "border-emerald-600"
                : "border-muted",
              i === shown && "border-amber-500"
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      <Problem />
      {progress.kind === "done" && shown === 4 ? (
        <p className="bg-muted rounded-xl p-3 text-sm">
          {endedAs(progress.result)}
        </p>
      ) : shown === 0 ? (
        <Read pick={pick} pickRef={pickRef} onNext={() => setViewed(1)} />
      ) : shown === 1 ? (
        <Decide state={state} pickRef={pickRef} advance={follow} />
      ) : shown === 2 ? (
        <Resume pick={pick} pickRef={pickRef} advance={follow} />
      ) : shown === 3 ? (
        <Apply
          state={state}
          pick={pick}
          pickRef={pickRef}
          onDone={
            progress.kind === "open" && progress.step === 4
              ? (): void => setViewed(4)
              : null
          }
        />
      ) : (
        <Ending state={state} pickRef={pickRef} advance={follow} />
      )}
    </div>
  )
}

import type { ChangeEvent, JSX } from "react"
import { useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Badge,
  Button,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@some-ui/shared"
import { ExternalLink, FileText, FolderOpen } from "lucide-react"

import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { Brief, Desk } from "@/lib/job-brief"
import {
  buildCommand,
  confirmationFileName,
  confirmationOf,
  resumeFile,
  SKIP_REASONS,
} from "@/lib/job-brief"
import { copyText } from "@/lib/job-brief/clipboard"
import type { Importing } from "@/lib/job-brief/runtime"
import { jobDesk } from "@/lib/job-brief/runtime"

/**
 * The Android app's jobs page (`routes/_dashboard/_apk/jobs.tsx`). Device
 * build only, like this module (`build.paths.ts`): render it behind an inline
 * `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 *
 * One job at a time: the brief a scheduled run left in Drive (why this
 * posting, which résumé to build, what to paste), opened from the file
 * picker, worked through, and confirmed back to Drive through the share
 * sheet. The run writes the next brief once that confirmation is there.
 *
 * The desk and its rules are `@/lib/job-brief`; this page reads its
 * snapshot and forwards taps.
 */

const DRIVE_FOLDER = "Drive › some-ui jobs"

const GAP_LABEL: Record<Brief["gaps"][number]["kind"], string> = {
  unknown: "Unknown",
  learnable: "Learnable",
  hard: "Hard",
}

const sectionHeading =
  "text-muted-foreground text-xs font-semibold tracking-wider uppercase"

const CopyButton = ({
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

/** The picker: Android's lists Drive beside the phone's own files. */
const OpenBrief = ({
  importing,
  prominent,
}: {
  importing: Importing
  prominent: boolean
}): JSX.Element => {
  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // Cleared, so picking the same file again still reads it.
    event.target.value = ""
    if (file) jobDesk().open(file)
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        asChild
        variant={prominent ? "default" : "outline"}
        size={prominent ? "lg" : "sm"}
      >
        <label className="cursor-pointer">
          <FolderOpen aria-hidden />
          {importing.kind === "reading" ? "Reading…" : "Open brief.json"}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onPick}
          />
        </label>
      </Button>
      {importing.kind === "rejected" && (
        <p role="alert" className="text-destructive text-sm">
          {importing.problem}
        </p>
      )}
    </div>
  )
}

const BriefTab = ({ brief }: { brief: Brief }): JSX.Element => {
  const { posting, resume } = brief
  const facts = [posting.location, posting.compensation, posting.experience]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={brief.verdict === "apply" ? "default" : "secondary"}>
            {brief.verdict === "apply" ? "Apply" : "Stretch"}
          </Badge>
          {posting.verifiedOpenOn && (
            <span className="text-muted-foreground text-sm">
              Verified open {posting.verifiedOpenOn}
            </span>
          )}
        </div>
        <h2 className="text-2xl leading-tight font-bold">{posting.title}</h2>
        <p className="font-medium">{posting.company}</p>
        <div className="flex flex-wrap gap-1.5">
          {facts.map(
            (fact) =>
              fact && (
                <span
                  key={fact}
                  className="bg-muted rounded-md px-2.5 py-1 text-sm"
                >
                  {fact}
                </span>
              )
          )}
        </div>
      </div>

      <Button asChild size="lg">
        <a href={posting.applyUrl} target="_blank" rel="noreferrer">
          Open the application
          <ExternalLink aria-hidden />
        </a>
      </Button>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <FileText aria-hidden className="size-5 shrink-0" />
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">
              Résumé: {resume.variant} · {resume.template}
            </span>
            <span className="text-muted-foreground text-xs">
              Build at {resume.ref}, then put it in {DRIVE_FOLDER} › Recommended
              resume
            </span>
          </div>
        </div>
        {resume.tailoring && (
          <p className="text-muted-foreground text-sm">{resume.tailoring}</p>
        )}
        <code className="bg-muted rounded-md p-2 text-xs break-all">
          {buildCommand(resume)}
        </code>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground font-mono text-xs break-all">
            documents/{resumeFile(resume)}
          </span>
          <CopyButton text={buildCommand(resume)} what="the build command" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>What they want</h3>
        <p className="leading-relaxed">{brief.wants}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className={sectionHeading}>Why you fit</h3>
        <ul className="flex flex-col gap-2">
          {brief.fits.map((fit) => (
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

      {brief.gaps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionHeading}>Gaps</h3>
          <ul className="flex flex-col gap-2">
            {brief.gaps.map((gap) => (
              <li key={gap.text} className="flex items-baseline gap-2 text-sm">
                <Badge
                  variant="outline"
                  className="w-20 shrink-0 justify-center"
                >
                  {GAP_LABEL[gap.kind]}
                </Badge>
                {gap.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.dontClaim.length > 0 && (
        <section className="border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-xl border p-4">
          <h3 className={cn(sectionHeading, "text-destructive")}>
            Don’t claim
          </h3>
          <p className="text-sm">{brief.dontClaim.join(" · ")}</p>
        </section>
      )}

      <p className="text-muted-foreground text-xs">
        Checked at some-ui {brief.evidence.someUi} · server{" "}
        {brief.evidence.server}. Brief {brief.id}.
      </p>
    </div>
  )
}

const KitTab = ({ brief }: { brief: Brief }): JSX.Element => {
  const { kit } = brief
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Copy each into the form. Attach the résumé from {DRIVE_FOLDER} ›
        Recommended resume.
      </p>

      {[
        { heading: "Your details", rows: kit.fields },
        { heading: "Standard questions", rows: kit.answers },
      ].map(
        ({ heading, rows }) =>
          rows.length > 0 && (
            <section key={heading} className="flex flex-col gap-2">
              <h3 className={sectionHeading}>{heading}</h3>
              <ul className="divide-y rounded-xl border">
                {rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-muted-foreground text-xs">
                        {row.label}
                      </span>
                      <span className="break-words select-all">
                        {row.value}
                      </span>
                    </span>
                    <CopyButton text={row.value} what={row.label} />
                  </li>
                ))}
              </ul>
            </section>
          )
      )}

      {kit.why && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionHeading}>{kit.why.prompt} (draft)</h3>
          <p className="rounded-xl border p-3 leading-relaxed select-all">
            {kit.why.draft}
          </p>
          <CopyButton text={kit.why.draft} what="the answer" />
        </section>
      )}

      <section className="bg-muted flex flex-col gap-1 rounded-xl p-4">
        <h3 className={sectionHeading}>Left for you</h3>
        <p className="text-sm">
          Voluntary EEO questions, anything not listed here, and the final
          Submit.
        </p>
      </section>
    </div>
  )
}

const ConfirmTab = ({
  desk,
}: {
  desk: Exclude<Desk, { kind: "empty" }>
}): JSX.Element => {
  const share = useAsyncIntent(() => jobDesk().share(), {
    presentation: "interactive",
  })
  const confirmation = confirmationOf(desk, new Date())

  return (
    <div className="flex flex-col gap-5">
      {desk.kind === "confirmed" ? (
        <p className="bg-muted rounded-xl p-4 text-sm">
          {desk.confirmation.outcome === "applied" ? "Applied" : "Skipped"},
          shared {desk.confirmation.at.slice(0, 10)}. The next brief comes once
          the scheduled run has logged this one.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className={sectionHeading}>Outcome</h3>
            <div
              role="group"
              aria-label="Outcome"
              className="grid grid-cols-2 gap-2"
            >
              {(["applied", "skipped"] as const).map((outcome) => (
                <Button
                  key={outcome}
                  type="button"
                  size="lg"
                  variant={
                    desk.draft.outcome === outcome ? "default" : "outline"
                  }
                  aria-pressed={desk.draft.outcome === outcome}
                  onClick={() =>
                    jobDesk().dispatch({ type: "outcome", outcome })
                  }
                >
                  {outcome === "applied" ? "Applied" : "Skipped"}
                </Button>
              ))}
            </div>
          </section>

          {desk.draft.outcome === "skipped" && (
            <section className="flex flex-col gap-2">
              <h3 className={sectionHeading}>Why skip</h3>
              <div
                role="group"
                aria-label="Why skip"
                className="flex flex-wrap gap-2"
              >
                {SKIP_REASONS.map(([reason, label]) => (
                  <Button
                    key={reason}
                    type="button"
                    className="rounded-full"
                    variant={
                      desk.draft.reason === reason ? "default" : "outline"
                    }
                    aria-pressed={desk.draft.reason === reason}
                    onClick={() =>
                      jobDesk().dispatch({ type: "reason", reason })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <Label htmlFor="job-notes" className={sectionHeading}>
              Notes / feedback
            </Label>
            <Textarea
              id="job-notes"
              rows={4}
              value={desk.draft.notes}
              onChange={(event) =>
                jobDesk().dispatch({ type: "notes", notes: event.target.value })
              }
            />
          </section>
        </>
      )}

      {confirmation && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionHeading}>
            {confirmationFileName(confirmation.briefId)}
          </h3>
          <pre className="bg-muted overflow-x-auto rounded-xl p-3 text-xs leading-relaxed">
            {JSON.stringify(confirmation, null, 2)}
          </pre>
        </section>
      )}

      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        disabled={confirmation === null}
        size="lg"
        idleLabel={desk.kind === "confirmed" ? "Share again" : "Share to Drive"}
        workingLabel="Sharing…"
      />
      <p className="text-muted-foreground text-xs">
        Save it in {DRIVE_FOLDER} › Brief. The next run reads it, logs it, and
        only then writes a new brief.
      </p>
    </div>
  )
}

export const JobDesk = (): JSX.Element => {
  const runtime = jobDesk()
  const { desk, importing } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot
  )

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 pb-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
        {desk.kind !== "empty" && (
          <OpenBrief importing={importing} prominent={false} />
        )}
      </header>

      {desk.kind === "empty" ? (
        <section className="flex flex-col gap-4 py-8">
          <h2 className="text-xl font-bold">No brief open</h2>
          <p className="text-muted-foreground">
            Each weekday run leaves one brief in {DRIVE_FOLDER} › Brief. Open it
            here to read the case, copy your answers, and confirm when you’re
            done.
          </p>
          <OpenBrief importing={importing} prominent />
        </section>
      ) : (
        <Tabs defaultValue="brief" className="flex flex-col gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="kit">Apply kit</TabsTrigger>
            <TabsTrigger value="confirm">Confirm</TabsTrigger>
          </TabsList>
          <TabsContent value="brief">
            <BriefTab brief={desk.brief} />
          </TabsContent>
          <TabsContent value="kit">
            <KitTab brief={desk.brief} />
          </TabsContent>
          <TabsContent value="confirm">
            <ConfirmTab desk={desk} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

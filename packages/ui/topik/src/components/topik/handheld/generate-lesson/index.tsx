import type { JSX } from "react"
import { useState } from "react"
import { Button, Input, Textarea } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import type { LessonRequest, TopikLevel } from "@topik/lib/topik/generation"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import type { Intake } from "@topik/lib/topik/generation/intake"
import { fixRequest, intakeLesson } from "@topik/lib/topik/generation/intake"
import { Check, ClipboardCopy, Play } from "lucide-react"
import { cn } from "some-ui-utils"

type GenerateLessonProps = {
  defaultLevel: TopikLevel
  /** The prompt for a request, with the learner's survey digest appended. */
  buildPrompt: (request: Omit<LessonRequest, "survey">) => string
  onSave: (meta: TopikMetadata, batches: Array<ConversationBatch>) => void
  short: boolean
  /** Stories open with a reply already pasted. */
  initialReply?: string
}

/** Findings shown before "and N more". */
const SHOWN_FINDINGS = 6

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * The generation loop on a phone (adaptive-learning canon v1.7): the app hands
 * the learner the prompt for their own model, and takes the lesson back.
 * Nothing leaves the device - the prompt goes out through the clipboard, the
 * lesson comes back the same way, and the check runs here.
 */
export const GenerateLesson = ({
  defaultLevel,
  buildPrompt,
  onSave,
  short,
  initialReply = "",
}: GenerateLessonProps): JSX.Element => {
  const [level, setLevel] = useState<TopikLevel>(defaultLevel)
  const [scene, setScene] = useState("")
  const [copied, setCopied] = useState<"prompt" | "fixes" | null>(null)
  // Shown when the clipboard refuses: the text, selectable by hand.
  const [manual, setManual] = useState<string | null>(null)
  const [reply, setReply] = useState(initialReply)
  const [intake, setIntake] = useState<Intake | null>(() =>
    initialReply ? intakeLesson(initialReply) : null
  )

  const hand = async (
    text: string,
    kind: "prompt" | "fixes"
  ): Promise<void> => {
    const done = await copy(text)
    setCopied(done ? kind : null)
    setManual(done ? null : text)
  }

  const copyPrompt = (): void =>
    void hand(
      buildPrompt({ level, scene: scene.trim() || undefined }),
      "prompt"
    )

  const errors = intake?.ok
    ? intake.findings.filter((finding) => finding.severity === "error").length
    : 0

  const stage = (
    <div data-slot="topik-generate" className="flex w-full flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          1 · Ask your model
        </h2>
        <div
          role="radiogroup"
          aria-label="TOPIK level"
          className="grid grid-cols-6 gap-2"
        >
          {TOPIK_LEVELS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={level === value}
              aria-label={`TOPIK ${value}`}
              onClick={() => setLevel(value)}
              className={cn(
                "h-11 rounded-xl border text-base font-semibold",
                level === value
                  ? "border-primary/40 bg-primary/15"
                  : "border-border bg-card"
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <Input
          aria-label="Scene"
          placeholder="Scene (optional): the fiancée meets his mother"
          value={scene}
          onChange={(event) => setScene(event.target.value)}
          className="h-11 rounded-xl text-base"
        />
        <p className="text-muted-foreground text-sm">
          The prompt carries the lesson&apos;s rules and your last few survey
          answers. Paste it into any model, then paste its reply below.
        </p>
        {manual !== null && (
          <Textarea
            aria-label="Prompt to copy"
            readOnly
            value={manual}
            rows={4}
            onFocus={(event) => event.currentTarget.select()}
            className="rounded-xl font-mono text-xs"
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          2 · Paste its reply
        </h2>
        <Textarea
          aria-label="Your model's reply"
          placeholder="The whole reply, JSON blocks and all"
          value={reply}
          rows={short ? 3 : 5}
          onChange={(event) => {
            setReply(event.target.value)
            setIntake(null)
          }}
          className="rounded-xl font-mono text-xs"
        />
        {intake && !intake.ok && (
          <p role="alert" className="text-destructive text-sm">
            {intake.error}
          </p>
        )}
        {intake?.ok && (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">
              {intake.meta.displayName} · {intake.meta.batchCount} conversations
            </p>
            {intake.findings.length === 0 ? (
              <p className="text-success flex items-center gap-2">
                <Check className="size-4" /> Every probe will be asked as
                written.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {errors > 0
                    ? `${errors} probe problem${errors === 1 ? "" : "s"}: those won't be asked as written. You can start anyway, or send the fixes to your model.`
                    : "Warnings only: the lesson plays as written."}
                </p>
                <ul className="flex flex-col gap-1">
                  {intake.findings.slice(0, SHOWN_FINDINGS).map((finding) => (
                    <li
                      key={`${finding.batch ?? "file"}:${finding.probe ?? ""}:${finding.message}`}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs",
                        finding.severity === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {finding.probe ? `${finding.probe}: ` : ""}
                      {finding.message}
                    </li>
                  ))}
                </ul>
                {intake.findings.length > SHOWN_FINDINGS && (
                  <p className="text-muted-foreground text-xs">
                    and {intake.findings.length - SHOWN_FINDINGS} more
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )

  const dock = ((): JSX.Element => {
    if (reply.trim() === "") {
      return (
        <Button className="h-12 w-full gap-2 rounded-2xl" onClick={copyPrompt}>
          {copied === "prompt" ? (
            <>
              <Check className="size-5" /> Copied: paste it into your model
            </>
          ) : (
            <>
              <ClipboardCopy className="size-5" /> Copy the prompt
            </>
          )}
        </Button>
      )
    }
    if (intake === null) {
      return (
        <>
          <Button
            className="h-12 w-full rounded-2xl"
            onClick={() => setIntake(intakeLesson(reply))}
          >
            Check the lesson
          </Button>
          <Button
            variant="ghost"
            className="h-10 w-full rounded-2xl text-sm"
            onClick={copyPrompt}
          >
            Copy the prompt again
          </Button>
        </>
      )
    }
    if (!intake.ok) {
      return (
        <Button
          variant="outline"
          className="h-12 w-full gap-2 rounded-2xl"
          onClick={copyPrompt}
        >
          <ClipboardCopy className="size-5" /> Copy the prompt again
        </Button>
      )
    }
    return (
      <>
        <Button
          className="h-12 w-full gap-2 rounded-2xl"
          onClick={() => onSave(intake.meta, intake.batches)}
        >
          <Play className="size-5" /> Save and start
        </Button>
        {intake.findings.length > 0 && (
          <Button
            variant="ghost"
            className="h-10 w-full rounded-2xl text-sm"
            onClick={() => void hand(fixRequest(intake.findings), "fixes")}
          >
            {copied === "fixes"
              ? "Fixes copied: paste them to your model"
              : "Copy the fixes for your model"}
          </Button>
        )}
      </>
    )
  })()

  return <StepLayout short={short} stage={stage} dock={dock} longForm />
}

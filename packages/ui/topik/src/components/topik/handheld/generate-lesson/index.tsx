import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import { scenesOf } from "@some-ui/makjang"
import { Button, Input, Textarea } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type {
  LessonFormat,
  LessonRequest,
  TopikLevel,
} from "@topik/lib/topik/generation"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import type { Intake } from "@topik/lib/topik/generation/intake"
import { fixRequest, intakeLesson } from "@topik/lib/topik/generation/intake"
import type { TreeIntake } from "@topik/lib/topik/generation/tree-intake"
import {
  findingPlace,
  intakeTree,
  treeFixRequest,
} from "@topik/lib/topik/generation/tree-intake"
import { Check, ClipboardCopy, Play } from "lucide-react"

type GenerateLessonProps = {
  defaultLevel: TopikLevel
  /** The prompt for a request, with the learner's survey digest appended. */
  buildPrompt: (
    request: Omit<LessonRequest, "survey">,
    format: LessonFormat
  ) => string
  /**
   * This prompt, exactly as handed off, reached the learner: the clipboard
   * took it, or they said they copied it from the fallback. A copy event on
   * the fallback is not enough - it proves some text was copied, not all of
   * it - so the learner confirms. Never called when the
   * clipboard refused and nothing was confirmed.
   */
  onPromptHandedOff?: (prompt: string) => void
  /** Holds the lesson for this session and starts it (canon Rem. 7.4). */
  onStart: (meta: TopikMetadata, batches: Array<ConversationBatch>) => void
  /** Holds a checked scene tree for this session and plays it. */
  onStartTree: (lesson: DramaLesson) => void
  short: boolean
  /**
   * The learner's shelf of kept lessons, where the host has one: shown
   * after the paste, since replaying one is the other way to a lesson of
   * their own.
   */
  kept?: JSX.Element
}

/** Findings shown before "and N more". */
const SHOWN_FINDINGS = 6

/** The phone's lesson is the drama; conversations stay until MKJ-S5. */
const FORMATS: ReadonlyArray<{ value: LessonFormat; label: string }> = [
  { value: "tree", label: "Drama" },
  { value: "conversations", label: "Conversations" },
]

/** A reply as checked: by the intake its format asked for. */
type Checked =
  | { format: "conversations"; intake: Intake }
  | { format: "tree"; intake: TreeIntake }

const check = (format: LessonFormat, reply: string): Checked =>
  format === "tree"
    ? { format, intake: intakeTree(reply) }
    : { format, intake: intakeLesson(reply) }

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
 * lesson comes back the same way, and the check runs here. This is the
 * learner's option (Cor. 8.3); the lesson lasts the session, and their
 * model's chat is where it is kept (Rem. 7.4).
 */
export const GenerateLesson = ({
  defaultLevel,
  buildPrompt,
  onPromptHandedOff,
  onStart,
  onStartTree,
  short,
  kept,
}: GenerateLessonProps): JSX.Element => {
  const [format, setFormat] = useState<LessonFormat>("tree")
  const [level, setLevel] = useState<TopikLevel>(defaultLevel)
  const [scene, setScene] = useState("")
  const [copied, setCopied] = useState<"prompt" | "fixes" | null>(null)
  // Shown when the clipboard refuses: the text, selectable by hand.
  const [manual, setManual] = useState<{
    text: string
    kind: "prompt" | "fixes"
  } | null>(null)
  const [reply, setReply] = useState("")
  const [checked, setChecked] = useState<Checked | null>(null)
  const intake = checked?.format === "conversations" ? checked.intake : null

  const hand = async (
    text: string,
    kind: "prompt" | "fixes"
  ): Promise<void> => {
    const done = await copy(text)
    setCopied(done ? kind : null)
    setManual(done ? null : { text, kind })
    if (done && kind === "prompt") onPromptHandedOff?.(text)
  }

  // The learner's word that the fallback's whole prompt reached their model.
  const confirmManualCopy = (): void => {
    if (manual?.kind !== "prompt") return
    onPromptHandedOff?.(manual.text)
    setManual(null)
    setCopied("prompt")
  }

  const copyPrompt = (): void =>
    void hand(
      buildPrompt({ level, scene: scene.trim() || undefined }, format),
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
          aria-label="Lesson format"
          className="grid grid-cols-2 gap-2"
        >
          {FORMATS.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={format === choice.value}
              onClick={() => {
                // Another format is another prompt, not yet copied.
                setFormat(choice.value)
                setChecked(null)
                setCopied(null)
              }}
              className={cn(
                "h-11 rounded-xl border text-base font-semibold",
                format === choice.value
                  ? "border-primary/40 bg-primary/15"
                  : "border-border bg-card"
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
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
          answers. Paste it into any model, then paste its reply below. The
          lesson lasts this session; your chat with the model keeps it.
        </p>
        {manual !== null && (
          <>
            <Textarea
              aria-label="Prompt to copy"
              readOnly
              value={manual.text}
              rows={4}
              onFocus={(event) => event.currentTarget.select()}
              className="rounded-xl font-mono text-xs"
            />
            {manual.kind === "prompt" && (
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-xl"
                onClick={confirmManualCopy}
              >
                <Check className="size-4" /> I&apos;ve copied it
              </Button>
            )}
          </>
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
            setChecked(null)
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
                    ? `${errors} probe problem${errors === 1 ? "" : "s"}: those probes are left out. You can start without them, or send the fixes to your model.`
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
        {checked?.format === "tree" && <TreeVerdict intake={checked.intake} />}
      </section>
      {kept}
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
    if (checked === null) {
      return (
        <>
          <Button
            className="h-12 w-full rounded-2xl"
            onClick={() => setChecked(check(format, reply))}
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
    if (checked.format === "tree") {
      const tree = checked.intake
      return (
        <>
          {tree.status === "checked" && (
            <Button
              className="h-12 w-full gap-2 rounded-2xl"
              onClick={() => onStartTree(tree.lesson)}
            >
              <Play className="size-5" /> Start
            </Button>
          )}
          {tree.status !== "absent" && tree.findings.length > 0 && (
            <Button
              variant={tree.status === "checked" ? "ghost" : "outline"}
              className="h-10 w-full rounded-2xl text-sm"
              onClick={() => void hand(treeFixRequest(tree.findings), "fixes")}
            >
              {copied === "fixes"
                ? "Fixes copied: paste them to your model"
                : "Copy the fixes for your model"}
            </Button>
          )}
          {tree.status !== "checked" && (
            <Button
              variant="ghost"
              className="h-10 w-full gap-2 rounded-2xl text-sm"
              onClick={copyPrompt}
            >
              <ClipboardCopy className="size-4" /> Copy the prompt again
            </Button>
          )}
        </>
      )
    }
    const verdict = checked.intake
    if (!verdict.ok) {
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
          onClick={() => onStart(verdict.meta, verdict.batches)}
        >
          <Play className="size-5" /> Start
        </Button>
        {verdict.findings.length > 0 && (
          <Button
            variant="ghost"
            className="h-10 w-full rounded-2xl text-sm"
            onClick={() => void hand(fixRequest(verdict.findings), "fixes")}
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

/** What the two audits made of a pasted tree (docs/makjang, "4. Authoring"). */
const TreeVerdict = ({ intake }: { intake: TreeIntake }): JSX.Element => {
  if (intake.status === "absent") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {intake.error}
      </p>
    )
  }
  const errors = intake.findings.filter(
    (finding) => finding.severity === "error"
  ).length
  const summary =
    intake.status === "rejected"
      ? `This drama can't be played: ${intake.findings.length} problem${intake.findings.length === 1 ? "" : "s"}. Send the fixes to your model.`
      : intake.findings.length === 0
        ? null
        : errors > 0
          ? `${errors} choice problem${errors === 1 ? "" : "s"}: those choices are left out, and the scene ends there. You can start without them, or send the fixes to your model.`
          : "Warnings only: the drama plays as written."
  return (
    <div
      role={intake.status === "rejected" ? "alert" : "status"}
      className="flex flex-col gap-2 text-sm"
    >
      {intake.status === "checked" && (
        <p className="font-semibold">
          Drama · TOPIK {intake.lesson.level} ·{" "}
          {scenesOf(intake.lesson.root).length} scenes
        </p>
      )}
      {summary === null ? (
        <p className="text-success flex items-center gap-2">
          <Check className="size-4" /> Every choice will be asked as written.
        </p>
      ) : (
        <p
          className={
            intake.status === "rejected"
              ? "text-destructive"
              : "text-muted-foreground"
          }
        >
          {summary}
        </p>
      )}
      {intake.findings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {intake.findings.slice(0, SHOWN_FINDINGS).map((finding) => (
            <li
              key={`${finding.audit}:${finding.path}:${finding.message}`}
              className={cn(
                "rounded-lg px-2 py-1 text-xs",
                finding.severity === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {findingPlace(finding)}: {finding.message}
            </li>
          ))}
        </ul>
      )}
      {intake.findings.length > SHOWN_FINDINGS && (
        <p className="text-muted-foreground text-xs">
          and {intake.findings.length - SHOWN_FINDINGS} more
        </p>
      )}
    </div>
  )
}

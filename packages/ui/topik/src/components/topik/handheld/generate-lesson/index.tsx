import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import { scenesOf } from "@some-ui/makjang"
import { Button, Input, Textarea } from "@some-ui/shared"
import { SharePrompt } from "@topik/components/topik/handheld/share-prompt"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { TopikLevel, TreeRequest } from "@topik/lib/topik/generation"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import type { FindingRow } from "@topik/lib/topik/generation/tree-intake"
import {
  intakeTree,
  treeFindingRow,
  treeFixRequest,
  treeSummary,
} from "@topik/lib/topik/generation/tree-intake"
import { Check, ClipboardCopy, Play } from "lucide-react"

type GenerateLessonProps = {
  defaultLevel: TopikLevel
  /** The tree prompt for a request, with the learner's last drama. */
  buildPrompt: (request: Pick<TreeRequest, "level" | "scene">) => string
  /**
   * This prompt, exactly as handed off, reached the learner: the clipboard
   * took it, or they said they copied it from the fallback. A copy event on
   * the fallback is not enough - it proves some text was copied, not all of
   * it - so the learner confirms. Never called when the
   * clipboard refused and nothing was confirmed.
   */
  onPromptHandedOff?: (prompt: string) => void
  /** Holds a checked scene tree for this session and plays it (Rem. 7.4). */
  onStartTree: (lesson: DramaLesson) => void
  short: boolean
  /**
   * The learner's shelf of kept lessons, where the host has one: shown
   * after the paste, since replaying one is the other way to a lesson of
   * their own.
   */
  kept?: JSX.Element
  share?: FileShare
}

/** Findings shown before "and N more". */
const SHOWN_FINDINGS = 6

const LEVELS: ReadonlyArray<Choice<TopikLevel>> = TOPIK_LEVELS.map((value) => ({
  value,
  label: String(value),
  name: `TOPIK ${value}`,
}))

type Choice<T> = { value: T; label: string; name?: string }

/** One row of mutually exclusive buttons, as a radio group. */
const RadioRow = <T extends string | number>({
  label,
  choices,
  value,
  onChange,
  className,
}: {
  label: string
  choices: ReadonlyArray<Choice<T>>
  value: T
  onChange: (value: T) => void
  className: string
}): JSX.Element => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn("grid gap-2", className)}
  >
    {choices.map((choice) => (
      <button
        key={choice.value}
        type="button"
        role="radio"
        aria-checked={value === choice.value}
        aria-label={choice.name}
        onClick={() => onChange(choice.value)}
        className={cn(
          "h-11 rounded-xl border text-base font-semibold",
          value === choice.value
            ? "border-primary/40 bg-primary/15"
            : "border-border bg-card"
        )}
      >
        {choice.label}
      </button>
    ))}
  </div>
)

/**
 * A reply as the tree intake judged it, in the words the screen shows:
 * no lesson at all, or a lesson that plays (`start`) or cannot (`null`),
 * with its findings and the fixes to send back.
 */
type Verdict =
  | { kind: "absent"; error: string }
  | {
      kind: "checked" | "rejected"
      title: string | null
      summary: string | null
      findings: Array<FindingRow>
      fixes: string
      start: (() => void) | null
    }

function verdictOf(
  reply: string,
  start: (lesson: DramaLesson) => void
): Verdict {
  const intake = intakeTree(reply)
  if (intake.status === "absent") return { kind: "absent", error: intake.error }
  const { lesson } = intake.status === "checked" ? intake : { lesson: null }
  return {
    kind: intake.status,
    title: lesson
      ? `Drama · TOPIK ${lesson.level} · ${scenesOf(lesson.root).length} scenes`
      : null,
    summary: treeSummary(intake),
    findings: intake.findings.map(treeFindingRow),
    fixes: treeFixRequest(intake.findings),
    start: lesson ? (): void => start(lesson) : null,
  }
}

/** What the intake made of the reply. */
const VerdictView = ({
  verdict,
  success,
}: {
  verdict: Verdict
  /** Said when a lesson that plays has no findings. */
  success: string
}): JSX.Element => {
  if (verdict.kind === "absent") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {verdict.error}
      </p>
    )
  }
  const rejected = verdict.kind === "rejected"
  return (
    <div
      role={rejected ? "alert" : "status"}
      className="flex flex-col gap-2 text-sm"
    >
      {verdict.title && <p className="font-semibold">{verdict.title}</p>}
      {verdict.summary === null ? (
        <p className="text-success flex items-center gap-2">
          <Check className="size-4" /> {success}
        </p>
      ) : (
        <p className={rejected ? "text-destructive" : "text-muted-foreground"}>
          {verdict.summary}
        </p>
      )}
      {verdict.findings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {verdict.findings.slice(0, SHOWN_FINDINGS).map((finding) => (
            <li
              key={finding.key}
              className={cn(
                "rounded-lg px-2 py-1 text-xs",
                finding.error
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {finding.text}
            </li>
          ))}
        </ul>
      )}
      {verdict.findings.length > SHOWN_FINDINGS && (
        <p className="text-muted-foreground text-xs">
          and {verdict.findings.length - SHOWN_FINDINGS} more
        </p>
      )}
    </div>
  )
}

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
  onStartTree,
  short,
  kept,
  share,
}: GenerateLessonProps): JSX.Element => {
  const [level, setLevel] = useState<TopikLevel>(defaultLevel)
  const [scene, setScene] = useState("")
  const [copied, setCopied] = useState<"prompt" | "fixes" | null>(null)
  // Shown when the clipboard refuses: the text, selectable by hand.
  const [manual, setManual] = useState<{
    text: string
    kind: "prompt" | "fixes"
  } | null>(null)
  const [reply, setReply] = useState("")
  const [verdict, setVerdict] = useState<Verdict | null>(null)

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

  const prompt = (): string =>
    buildPrompt({ level, scene: scene.trim() || undefined })
  const copyPrompt = (): void => void hand(prompt(), "prompt")

  const stage = (
    <div data-slot="topik-generate" className="flex w-full flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          1 · Ask your model
        </h2>
        <RadioRow
          label="TOPIK level"
          choices={LEVELS}
          value={level}
          onChange={setLevel}
          className="grid-cols-6"
        />
        <Input
          aria-label="Scene"
          placeholder="Scene (optional): the fiancée meets his mother"
          value={scene}
          onChange={(event) => setScene(event.target.value)}
          className="h-11 rounded-xl text-base"
        />
        <p className="text-muted-foreground text-sm">
          The prompt carries the drama&apos;s rules and how your last one went.
          Paste it into any model, then paste its reply below. The lesson lasts
          this session; your chat with the model keeps it.
        </p>
        {share && (
          <SharePrompt
            share={share}
            prompt={prompt}
            onShared={(text) => onPromptHandedOff?.(text)}
          />
        )}
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
            setVerdict(null)
          }}
          className="rounded-xl font-mono text-xs"
        />
        {verdict && (
          <VerdictView
            verdict={verdict}
            success="Every choice will be asked as written."
          />
        )}
      </section>
      {kept}
    </div>
  )

  const copyAgain = (prominent: boolean): JSX.Element => (
    <Button
      variant={prominent ? "outline" : "ghost"}
      className={cn(
        "w-full gap-2 rounded-2xl",
        prominent ? "h-12" : "h-10 text-sm"
      )}
      onClick={copyPrompt}
    >
      <ClipboardCopy className={prominent ? "size-5" : "size-4"} /> Copy the
      prompt again
    </Button>
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
    if (verdict === null) {
      return (
        <>
          <Button
            className="h-12 w-full rounded-2xl"
            onClick={() => setVerdict(verdictOf(reply, onStartTree))}
          >
            Read the reply
          </Button>
          {copyAgain(false)}
        </>
      )
    }
    if (verdict.kind === "absent") return copyAgain(true)
    const { start, fixes, findings } = verdict
    return (
      <>
        {start && (
          <Button className="h-12 w-full gap-2 rounded-2xl" onClick={start}>
            <Play className="size-5" /> Start
          </Button>
        )}
        {findings.length > 0 && (
          <Button
            variant={start ? "ghost" : "outline"}
            className="h-10 w-full rounded-2xl text-sm"
            onClick={() => void hand(fixes, "fixes")}
          >
            {copied === "fixes"
              ? "Fixes copied: paste them to your model"
              : "Copy the fixes for your model"}
          </Button>
        )}
        {!start && copyAgain(false)}
      </>
    )
  })()

  return <StepLayout short={short} stage={stage} dock={dock} longForm />
}

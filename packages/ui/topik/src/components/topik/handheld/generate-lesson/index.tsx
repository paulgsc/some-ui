import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Textarea,
} from "@some-ui/shared"
import { AskScene } from "@topik/components/topik/handheld/ask-scene"
import { SceneVoiceNotes } from "@topik/components/topik/handheld/scene-voice"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import {
  ToggleChip,
  toggled,
} from "@topik/components/topik/handheld/toggle-chip"
import { useSceneVoice } from "@topik/lib/topik/adapter/hooks/use-scene-voice"
import type { SceneAsk } from "@topik/lib/topik/adapter/next-scene-ask"
import type { SceneVoice } from "@topik/lib/topik/adapter/scene-voice"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { titleOf } from "@topik/lib/topik/core/drama"
import type { Seed } from "@topik/lib/topik/core/feed-card"
import { GENRES, koreanGenre } from "@topik/lib/topik/core/feed-card"
import type { DramaRequest, TopikLevel } from "@topik/lib/topik/generation"
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
  buildPrompt: (request: DramaRequest) => string
  /** A card's seed (`core/feed-card`), read at mount. */
  initialSeed?: Seed
  /** A reply that came as a file and did not play, judged at once. */
  initialReply?: string
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
  /** Asks home for the next scene, where the host gives it. */
  sceneAsk?: SceneAsk
  sceneVoice?: SceneVoice
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
 * The drama's genres, as chips: the templated ones and any a card brought.
 * None picked is the prompt's default.
 */
const GenrePicker = ({
  brought,
  picked,
  onPick,
}: {
  brought: Array<string>
  picked: Array<string>
  onPick: (genres: Array<string>) => void
}): JSX.Element => (
  <div role="group" aria-label="Genre" className="flex flex-wrap gap-2">
    {[...new Set([...GENRES.map(({ genre }) => genre), ...brought])].map(
      (genre) => {
        const ko = koreanGenre(genre)
        return (
          <ToggleChip
            key={genre}
            ko={ko ?? genre}
            small={ko && genre}
            smallLang="en"
            picked={picked.includes(genre)}
            onToggle={() => onPick(toggled(picked, genre))}
          />
        )
      }
    )}
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
    title: lesson ? `${titleOf(lesson)} · TOPIK ${lesson.level}` : null,
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
  sceneAsk,
  sceneVoice,
  initialSeed,
  initialReply,
}: GenerateLessonProps): JSX.Element => {
  const voice = useSceneVoice(sceneVoice)
  const notes = voice?.notes ?? []
  const [level, setLevel] = useState<TopikLevel>(defaultLevel)
  const [scene, setScene] = useState(initialSeed?.scene ?? "")
  const [genres, setGenres] = useState<Array<string>>(initialSeed?.genres ?? [])
  const [copied, setCopied] = useState<"prompt" | "fixes" | null>(null)
  // Shown when the clipboard refuses: the text, selectable by hand.
  const [manual, setManual] = useState<{
    text: string
    kind: "prompt" | "fixes"
  } | null>(null)
  const [reply, setReply] = useState(initialReply ?? "")
  const [verdict, setVerdict] = useState<Verdict | null>(() =>
    initialReply === undefined ? null : verdictOf(initialReply, onStartTree)
  )

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

  const prompt = (voiceNotes: ReadonlyArray<string> = []): string =>
    buildPrompt({
      level,
      scene: scene.trim() || undefined,
      genres,
      voiceNotes,
    })
  const copyPrompt = (): void => void hand(prompt(), "prompt")
  const levelAndGenre = [
    `TOPIK ${level}`,
    ...genres.map((genre) => koreanGenre(genre) ?? genre),
  ].join(" · ")

  const stage = (
    <div data-slot="topik-generate" className="flex w-full flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          1 · Your scene
        </h2>
        {sceneVoice && voice && (
          <SceneVoiceNotes voice={sceneVoice} snapshot={voice} />
        )}
        <Input
          aria-label="Scene"
          placeholder={
            sceneVoice
              ? "Or a line: the fiancée meets his mother"
              : "Scene (optional): the fiancée meets his mother"
          }
          value={scene}
          onChange={(event) => setScene(event.target.value)}
          className="h-11 rounded-xl text-base"
        />
        <Accordion
          type="single"
          collapsible
          className="border-border rounded-2xl border px-3"
        >
          <AccordionItem value="level" className="border-none">
            <AccordionTrigger className="min-h-11 text-sm hover:no-underline">
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="font-semibold">Level and genre</span>
                <span lang="ko" className="text-muted-foreground font-normal">
                  {levelAndGenre}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3 px-1">
              <RadioRow
                label="TOPIK level"
                choices={LEVELS}
                value={level}
                onChange={setLevel}
                className="grid-cols-6"
              />
              <GenrePicker
                brought={initialSeed?.genres ?? []}
                picked={genres}
                onPick={setGenres}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          2 · Ask your model
        </h2>
        <p className="text-muted-foreground text-sm">
          The prompt carries the drama&apos;s rules and how your last one went.
          Paste it into any model, then paste its reply below. The lesson lasts
          this session; your chat with the model keeps it.
          {notes.length > 0 &&
            sceneAsk &&
            " Your voice notes go with your ask, not with a copied prompt."}
        </p>
        {sceneAsk && (
          <AskScene
            asks={sceneAsk}
            prompt={prompt}
            notes={notes}
            disabled={voice?.taking === true}
            onAsked={(text) => onPromptHandedOff?.(text)}
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
          3 · Paste its reply
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
        {verdict && <VerdictView verdict={verdict} success="Ready to play." />}
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

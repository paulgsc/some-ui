import type { JSX } from "react"
import { useMemo, useState } from "react"
import type { Reporting } from "@lesson-crm/lib/operation"
import { useOperation } from "@lesson-crm/lib/operation"
import { cn } from "@some-ui/core-utils"
import type { IntentError } from "@some-ui/intent-kit"
import { Button, Input, Label, Textarea } from "@some-ui/shared"
import type { TopikLevel } from "@some-ui/topik"
import {
  buildLessonPrompt,
  buildTreePrompt,
  DEFAULT_CONVERSATIONS,
  TOPIK_LEVELS,
} from "@some-ui/topik"
import { Check, ClipboardCopy } from "lucide-react"

/** The most conversations a batch lesson asks for; a scene, not a course. */
const MAX_CONVERSATIONS = 6

/**
 * Which prompt: the conversation lesson the desktop session plays, or a scene
 * tree for the phone (docs/makjang/README.md, "4. Authoring").
 */
type Format = "conversations" | "tree"

const FORMATS: Array<Choice<Format>> = [
  { value: "conversations", label: "Conversations" },
  { value: "tree", label: "Scene tree" },
]

type Choice<T> = {
  value: T
  label: string
  /** The accessible name, when the label alone is too terse. */
  name?: string
}

/** One row of mutually exclusive buttons, as a radio group. */
const Choices = <T extends string | number>({
  label,
  columns,
  options,
  value,
  onChange,
}: {
  label: string
  columns: string
  options: Array<Choice<T>>
  value: T
  onChange: (value: T) => void
}): JSX.Element => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn("grid shrink-0 gap-1", columns)}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        aria-label={option.name}
        onClick={() => onChange(option.value)}
        className={cn(
          "h-9 rounded-lg border text-sm font-semibold",
          value === option.value
            ? "border-primary/40 bg-primary/15"
            : "border-border bg-card"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
)

/**
 * Not a transport failure, so not the host's to name: the clipboard API is
 * absent outside a secure context, which a LAN page on plain `http://` is.
 */
const NO_CLIPBOARD: IntentError = {
  kind: "unavailable",
  retryable: false,
  summary:
    "This page can't use the clipboard (it isn't served over HTTPS). The prompt is shown below to copy by hand.",
  cause: null,
}

/**
 * The first step of a new lesson: the generator prompt, for the operator to
 * give any model. It is the prompt the phone hands a learner
 * (`buildLessonPrompt`, `@some-ui/topik`), with the request marked as the
 * weekly batch rather than one learner's next lesson - or the scene-tree
 * prompt (`buildTreePrompt`), whose reply is checked but not yet saved.
 *
 * Copying is an intent: it says it worked, or why not. Where the clipboard is
 * out of reach the prompt is shown instead, filling the rest of the pane and
 * selected on focus, to copy by hand.
 */
export const PromptCard = ({
  reporting,
}: {
  reporting: Reporting
}): JSX.Element => {
  const [format, setFormat] = useState<Format>("conversations")
  const [level, setLevel] = useState<TopikLevel>(2)
  const [scene, setScene] = useState("")
  const [conversations, setConversations] = useState(DEFAULT_CONVERSATIONS)

  const request = {
    level,
    scene: scene.trim() || undefined,
    audience: "batch",
  } as const
  const prompt =
    format === "tree"
      ? buildTreePrompt(request)
      : buildLessonPrompt({ ...request, conversations })

  const copyReporting = useMemo(
    (): Reporting => ({ ...reporting, mapError: () => NO_CLIPBOARD }),
    [reporting]
  )
  const copy = useOperation(
    async (text: string): Promise<string> => {
      await navigator.clipboard.writeText(text)
      return text
    },
    {
      success: () => "Prompt copied: paste it into your model",
      failure: () => "Couldn't copy the prompt",
    },
    copyReporting
  )
  // What was copied is only current while the request that made it is: a
  // changed level, scene or count is a different prompt.
  const copied =
    copy.state.status === "succeeded" && copy.state.value === prompt

  return (
    <section
      aria-label="Lesson prompt"
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <Choices
        label="Format"
        columns="grid-cols-2"
        options={FORMATS}
        value={format}
        onChange={setFormat}
      />
      <Choices
        label="TOPIK level"
        columns="grid-cols-6"
        options={TOPIK_LEVELS.map((value) => ({
          value,
          label: String(value),
          name: `TOPIK ${value}`,
        }))}
        value={level}
        onChange={setLevel}
      />
      <div className="grid shrink-0 gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          aria-label="Scene"
          placeholder="Scene (optional): the fiancée meets his mother"
          value={scene}
          onChange={(event) => setScene(event.target.value)}
        />
        {format === "conversations" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="lesson-conversations" className="text-xs">
              Conversations
            </Label>
            <Input
              id="lesson-conversations"
              type="number"
              min={1}
              max={MAX_CONVERSATIONS}
              value={conversations}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isInteger(next) && next >= 1) {
                  setConversations(Math.min(next, MAX_CONVERSATIONS))
                }
              }}
              className="w-16"
            />
          </div>
        )}
      </div>
      <Button
        variant="outline"
        className="shrink-0 gap-2 self-start"
        disabled={copy.state.status === "working"}
        onClick={() => copy.start(prompt)}
      >
        {copied ? (
          <>
            <Check className="size-4" /> Copied: paste it into your model
          </>
        ) : (
          <>
            <ClipboardCopy className="size-4" /> Copy the prompt
          </>
        )}
      </Button>
      {copy.state.status === "failed" && (
        <Textarea
          aria-label="Prompt to copy"
          data-scroll-intent="long-form"
          readOnly
          value={prompt}
          onFocus={(event) => event.currentTarget.select()}
          className={
            // scroll-intent: long-form - the whole prompt, to copy by hand; the box is what is left of the pane
            "field-sizing-fixed min-h-0 flex-1 resize-none font-mono text-xs"
          }
        />
      )}
      <p className="text-muted-foreground shrink-0 text-xs">
        {format === "tree"
          ? "Then bring the model's reply to the Lesson step: the tree is checked there, not saved yet."
          : "Then bring the model's whole reply to the Lesson step: the lesson, and the entry that names it."}
      </p>
    </section>
  )
}

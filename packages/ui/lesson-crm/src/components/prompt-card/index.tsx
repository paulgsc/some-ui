import type { JSX } from "react"
import { useState } from "react"
import { Button, Input, Label, Textarea } from "@some-ui/shared"
import type { TopikLevel } from "@some-ui/topik"
import {
  buildLessonPrompt,
  DEFAULT_CONVERSATIONS,
  TOPIK_LEVELS,
} from "@some-ui/topik"
import { Check, ClipboardCopy } from "lucide-react"
import { cn } from "some-ui-utils"

/** The most conversations a batch lesson asks for; a scene, not a course. */
const MAX_CONVERSATIONS = 6

async function copy(text: string): Promise<boolean> {
  try {
    // Throws where there is no clipboard API at all - outside a secure
    // context, which a LAN page on plain http:// is: the fallback's case.
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * The first step of a new lesson: the generator prompt, for the operator to
 * give any model. It is the prompt the phone hands a learner
 * (`buildLessonPrompt`, `@some-ui/topik`), with the request marked as the
 * weekly batch rather than one learner's next lesson.
 *
 * Copied to the clipboard where the page may use it. Where it may not - the
 * CRM is a LAN page, and plain `http://` is no secure context - the prompt is
 * shown instead, selected on focus, to copy by hand.
 */
export const PromptCard = (): JSX.Element => {
  const [level, setLevel] = useState<TopikLevel>(2)
  const [scene, setScene] = useState("")
  const [conversations, setConversations] = useState(DEFAULT_CONVERSATIONS)
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState<string | null>(null)

  const prompt = (): string =>
    buildLessonPrompt({
      level,
      scene: scene.trim() || undefined,
      conversations,
      audience: "batch",
    })

  // A changed request is a different prompt: what was copied is stale.
  const changed = (): void => {
    setCopied(false)
    setManual(null)
  }

  const copyPrompt = async (): Promise<void> => {
    const text = prompt()
    const done = await copy(text)
    setCopied(done)
    setManual(done ? null : text)
  }

  return (
    <section
      aria-label="Lesson prompt"
      className="border-border flex flex-col gap-3 rounded-xl border p-3"
    >
      <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        1 · Ask a model
      </h3>
      <div
        role="radiogroup"
        aria-label="TOPIK level"
        className="grid grid-cols-6 gap-1"
      >
        {TOPIK_LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={level === value}
            aria-label={`TOPIK ${value}`}
            onClick={() => {
              setLevel(value)
              changed()
            }}
            className={cn(
              "h-9 rounded-lg border text-sm font-semibold",
              level === value
                ? "border-primary/40 bg-primary/15"
                : "border-border bg-card"
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          aria-label="Scene"
          placeholder="Scene (optional): the fiancée meets his mother"
          value={scene}
          onChange={(event) => {
            setScene(event.target.value)
            changed()
          }}
        />
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
                changed()
              }
            }}
            className="w-16"
          />
        </div>
      </div>
      <Button
        variant="outline"
        className="gap-2 self-start"
        onClick={() => void copyPrompt()}
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
      {manual !== null && (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-muted-foreground text-xs">
            This page can&apos;t use the clipboard (it isn&apos;t served over
            HTTPS). Select the prompt and copy it by hand:
          </p>
          <Textarea
            aria-label="Prompt to copy"
            readOnly
            value={manual}
            rows={6}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
          />
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Then paste the model&apos;s whole reply below: the lesson, and the entry
        that names it.
      </p>
    </section>
  )
}

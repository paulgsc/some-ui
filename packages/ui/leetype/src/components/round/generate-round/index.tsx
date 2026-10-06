import type { FC } from "react"
import { useState } from "react"
import type { RoundRequest } from "@leetype/lib/leetype/generation"
import {
  DEFAULT_MEMBERS,
  MAX_MEMBERS,
  MIN_MEMBERS,
} from "@leetype/lib/leetype/generation"
import type { RoundIntake } from "@leetype/lib/leetype/generation/intake"
import { fixRequest, intakeRound } from "@leetype/lib/leetype/generation/intake"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { Round } from "@leetype/types/authored-round"
import { PropositionIdSchema } from "@leetype/types/round"
import { cn } from "@some-ui/core-utils"
import { Button, Input, Textarea } from "@some-ui/shared"
import { Check, ClipboardCopy, Play } from "lucide-react"

/** Violations shown before "and N more". */
const SHOWN_VIOLATIONS = 6

const MEMBER_COUNTS = Array.from(
  { length: MAX_MEMBERS - MIN_MEMBERS + 1 },
  (_, index) => MIN_MEMBERS + index
)

const FOCUS_OPTIONS = Object.values(PROPOSITION_REGISTER).filter(
  (entry) => entry.status === "active"
)

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type GenerateRoundProps = {
  /** Builds the prompt for this request; the caller adds what it knows (recent rounds, audience). */
  buildPrompt: (request: Omit<RoundRequest, "recent" | "audience">) => string
  /** A checked round, ready to play or publish. */
  onStart: (round: Round) => void
  /** What the start button says: "Play it" for a learner, "Use this round" for the CRM. */
  startLabel?: string
  /** Leaves without a round. Absent when the host has nowhere to go back to. */
  onCancel?: () => void
  initialReply?: string
  className?: string
}

/**
 * The round-generation loop, the same one TOPIK runs for lessons
 * (`@some-ui/topik`, `GenerateLesson`): the app hands the learner a prompt
 * for their own model and takes the round back. Nothing leaves the device.
 * The prompt goes out through the clipboard, the round comes back the same
 * way, and the check (`intakeRound`, the corpus lint CI runs) runs here. A
 * refused round comes with a fix request to send back to the model.
 *
 * The round CRM mounts this too, with the corpus audience: an operator
 * writes a round for everyone through the same prompt and the same check.
 */
export const GenerateRound: FC<GenerateRoundProps> = ({
  buildPrompt,
  onStart,
  startLabel = "Play it",
  onCancel,
  initialReply = "",
  className,
}) => {
  const [focus, setFocus] = useState<PropositionId | "">("")
  const [premise, setPremise] = useState("")
  const [members, setMembers] = useState(DEFAULT_MEMBERS)
  const [copied, setCopied] = useState<"prompt" | "fixes" | null>(null)
  // Shown when the clipboard refuses: the text, selectable by hand.
  const [manual, setManual] = useState<string | null>(null)
  const [reply, setReply] = useState(initialReply)
  const [intake, setIntake] = useState<RoundIntake | null>(() =>
    initialReply ? intakeRound(initialReply) : null
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
      buildPrompt({
        ...(focus === "" ? {} : { focus }),
        ...(premise.trim() === "" ? {} : { premise: premise.trim() }),
        members,
      }),
      "prompt"
    )

  return (
    <div
      data-slot="leetype-generate-round"
      className={cn("flex w-full min-w-0 flex-col gap-5", className)}
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          1 · Ask your model
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Proposition to practise</span>
          <select
            aria-label="Proposition to practise"
            value={focus}
            onChange={(event) => {
              const value = event.target.value
              const parsed = PropositionIdSchema.safeParse(value)
              setFocus(parsed.success ? parsed.data : "")
            }}
            className="h-11 rounded-xl border border-border bg-card px-3 text-base"
          >
            <option value="">Any</option>
            {FOCUS_OPTIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}: {entry.title}
              </option>
            ))}
          </select>
        </label>
        <Input
          aria-label="Premise"
          placeholder="Premise (optional): count pairs that sum to k"
          value={premise}
          onChange={(event) => setPremise(event.target.value)}
          className="h-11 rounded-xl text-base"
        />
        <div
          role="radiogroup"
          aria-label="Rewrites in the round"
          className="grid grid-cols-4 gap-2"
        >
          {MEMBER_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={members === count}
              aria-label={`${count} rewrites`}
              onClick={() => setMembers(count)}
              className={cn(
                "h-11 rounded-xl border text-base font-semibold",
                members === count
                  ? "border-primary/40 bg-primary/15"
                  : "border-border bg-card"
              )}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          The prompt carries the round&apos;s rules, the proposition register
          and a worked example. Paste it into any model, then paste its reply
          below. The round is checked here and lasts this session.
        </p>
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
        {manual !== null && (
          <Textarea
            aria-label="Text to copy"
            readOnly
            value={manual}
            rows={4}
            onFocus={(event) => event.currentTarget.select()}
            className="rounded-xl font-mono text-xs"
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          2 · Paste its reply
        </h2>
        <Textarea
          aria-label="Your model's reply"
          placeholder="The whole reply, JSON block and all"
          value={reply}
          rows={5}
          onChange={(event) => {
            setReply(event.target.value)
            setIntake(null)
          }}
          className="rounded-xl font-mono text-xs"
        />
        {intake !== null && !intake.ok && (
          <div role="alert" className="flex flex-col gap-2 text-sm">
            <p className="text-destructive">
              The round was refused: {intake.violations.length} problem
              {intake.violations.length === 1 ? "" : "s"}.
            </p>
            <ul className="flex flex-col gap-1">
              {intake.violations.slice(0, SHOWN_VIOLATIONS).map((violation) => (
                <li
                  key={violation}
                  className="rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive"
                >
                  {violation}
                </li>
              ))}
            </ul>
            {intake.violations.length > SHOWN_VIOLATIONS && (
              <p className="text-xs text-muted-foreground">
                and {intake.violations.length - SHOWN_VIOLATIONS} more
              </p>
            )}
            <Button
              variant="outline"
              className="h-11 w-full gap-2 rounded-2xl"
              onClick={() => void hand(fixRequest(intake.violations), "fixes")}
            >
              <ClipboardCopy className="size-4" />
              {copied === "fixes"
                ? "Fixes copied: paste them to your model"
                : "Copy the fixes for your model"}
            </Button>
          </div>
        )}
        {intake?.ok && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-emerald-400" aria-hidden="true" />
            {intake.round.id}: {intake.round.diffOptions.length} rewrites, every
            check passed.
          </p>
        )}
        {intake?.ok ? (
          <Button
            className="h-12 w-full gap-2 rounded-2xl"
            onClick={() => onStart(intake.round)}
          >
            <Play className="size-5" /> {startLabel}
          </Button>
        ) : (
          <Button
            className="h-12 w-full rounded-2xl"
            disabled={reply.trim() === ""}
            onClick={() => setIntake(intakeRound(reply))}
          >
            Check the round
          </Button>
        )}
        {onCancel && (
          <Button
            variant="ghost"
            className="h-10 w-full rounded-2xl text-sm"
            onClick={onCancel}
          >
            Back to the rounds
          </Button>
        )}
      </section>
    </div>
  )
}

import type { FC } from "react"
import { useEffect, useId, useRef, useState } from "react"
import { narrow } from "@leetype/lib/leetype/rationale-match"
import type { RationaleChoice } from "@leetype/types/exercise"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@some-ui/shared"
import { cn } from "some-ui-utils"

type RationaleAccordionProps = {
  /**
   * The step's authored candidates (LTY-WHY W2, #1102). Callers mount this
   * component only once a step's hunk is complete and `rationaleChoices`
   * is present — there is no "no candidates" render path here, by design.
   */
  candidates: ReadonlyArray<RationaleChoice>
  className?: string
}

/**
 * The reason-reaffirmation shim's widget (LTY-WHY W4, #1104): an accordion
 * under a completed step's hunk posing "why is this the right fix" as a
 * short leetyped answer rather than a click. See `docs/leetype/README.md`'s
 * LTY-WHY section for the posture this component is held to — recapped
 * here only where it constrains a rendering choice directly.
 *
 * Calls W3's `narrow()` (`lib/leetype/rationale-match.ts`) on every
 * keystroke from its own small input surface — never the shared
 * `ExerciseCard` textarea, never `press()`, never `TypingGameWasm`. This
 * component imports nothing from `types/leetype`'s engine vocabulary and
 * nothing wasm-shaped; `rationale-accordion.test.tsx` pins it the same way
 * `rationale-match.test.ts` pins its own engine-free boundary.
 *
 * Its keystroke listener is hand-rolled rather than
 * `hooks/leetype/use-keystroke-capture` (`ExerciseCard`'s own capture
 * hook): that hook always calls `preventDefault()` on Tab — sound there,
 * since the main exercise repurposes it as the manual-reveal toggle and
 * the capture element is the only focusable surface on the card. Reusing
 * it here trapped keyboard users inside this widget's
 * hidden input with no way to Tab to the trigger or the dead-end's "Clear
 * and try again" button (review finding on #1122). This listener forwards
 * only printable characters and Backspace; Tab, Shift+Tab, Enter and
 * everything else are left alone so native focus movement keeps working.
 *
 * **No verdict, anywhere.** A live candidate's typed-so-far prefix
 * highlights the same green `CodeDisplay` uses for a resolved keystroke —
 * borrowed because it means "you typed this," not a judgement on the
 * candidate, and every live candidate gets it equally, not just an
 * authored-canonical one. An eliminated candidate mutes; it never reddens,
 * because red is the engine's error color and reusing it here would
 * smuggle a verdict back in through paint. On completion: a neutral
 * "Noted." — no color, no modal, and no verdict language anywhere in this
 * file (grepped for in `rationale-accordion.test.tsx`).
 *
 * **Carries no step identity of its own.** All local state — `typed`,
 * whether the accordion is open — is scoped to one step by the caller
 * mounting a fresh instance per step (`key={stepKey}` at the call site,
 * per `docs/leetype/README.md`'s LTY-WHY section: nothing here persists
 * across a step boundary), not by an internal effect watching a step-id
 * prop. React already discards and remounts a keyed subtree when its key
 * changes, which is the whole reset for free — an effect doing the same
 * `setState` in response to a prop change would just be a slower, more
 * error-prone version of what the `key` already guarantees.
 */
export const RationaleAccordion: FC<RationaleAccordionProps> = ({
  candidates,
  className,
}) => {
  const [typed, setTyped] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()

  const texts = candidates.map((candidate) => candidate.text)
  const { live, completed } = narrow(texts, typed)
  const deadEnd = typed.length > 0 && live.length === 0 && completed === null

  useEffect(() => {
    const element = inputRef.current
    if (!element || !open || completed !== null) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === "Backspace") {
        event.preventDefault()
        setTyped((current) => current.slice(0, -1))
        return
      }

      // Tab, Shift+Tab, Enter, Escape and every other key are left
      // untouched — this widget is one focusable surface among several
      // (the trigger, the dead-end's Clear button), not the whole card.
      if (Array.from(event.key).length === 1) {
        event.preventDefault()
        setTyped((current) => current + event.key)
      }
    }

    const handleBeforeInput = (event: InputEvent): void => {
      if (event.inputType === "deleteContentBackward") {
        event.preventDefault()
        setTyped((current) => current.slice(0, -1))
        return
      }
      if (
        event.inputType === "insertText" ||
        event.inputType === "insertCompositionText"
      ) {
        event.preventDefault()
        const inserted = Array.from(event.data ?? "").join("")
        if (inserted.length > 0) {
          setTyped((current) => current + inserted)
        }
      }
    }

    element.addEventListener("keydown", handleKeyDown)
    element.addEventListener("beforeinput", handleBeforeInput)

    return (): void => {
      element.removeEventListener("keydown", handleKeyDown)
      element.removeEventListener("beforeinput", handleBeforeInput)
    }
  }, [open, completed])

  return (
    <Accordion
      type="single"
      collapsible
      value={open ? "why" : ""}
      onValueChange={(value) => setOpen(value === "why")}
      className={cn(
        "rounded-md border border-border/60 bg-background/90 font-mono text-sm shadow-sm",
        className
      )}
    >
      <AccordionItem value="why" className="border-none">
        <AccordionTrigger className="px-3 py-2 text-xs font-medium text-muted-foreground hover:no-underline">
          Why is this the right fix?
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-0">
          <label htmlFor={inputId} className="block cursor-text">
            <textarea
              id={inputId}
              ref={inputRef}
              value=""
              readOnly
              aria-label="Type a candidate rationale"
              className="absolute h-px w-px overflow-hidden opacity-0"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
            />

            <div className="flex flex-wrap gap-2">
              {candidates.map((candidate) => {
                const isLive = live.includes(candidate.text)
                const matched = isLive
                  ? Math.min(typed.length, candidate.text.length)
                  : 0

                return (
                  <span
                    key={candidate.text}
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      isLive
                        ? "border-border text-foreground"
                        : "border-border/40 text-muted-foreground/40"
                    )}
                  >
                    {isLive ? (
                      <>
                        <span className="bg-green-500/10 text-green-400">
                          {candidate.text.slice(0, matched)}
                        </span>
                        <span>{candidate.text.slice(matched)}</span>
                      </>
                    ) : (
                      candidate.text
                    )}
                  </span>
                )
              })}
            </div>

            {completed !== null && (
              <p className="mt-2 text-xs text-muted-foreground">Noted.</p>
            )}

            {deadEnd && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Nothing here matches anymore.</span>
                <button
                  type="button"
                  onClick={() => setTyped("")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Clear and try again
                </button>
              </div>
            )}
          </label>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

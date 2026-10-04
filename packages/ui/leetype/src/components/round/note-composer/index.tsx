import type { FC } from "react"
import { useId } from "react"
import {
  NOTE_KIND_COPY,
  NOTE_KINDS,
  NOTE_TEXT_MAX,
} from "@leetype/lib/leetype/notes"
import type {
  ComposerIntent,
  ComposerState,
} from "@leetype/lib/leetype/notes/composer"
import {
  COMPOSER_NOTICES,
  draftOf,
  isListening,
} from "@leetype/lib/leetype/notes/composer"
import type { Dictation } from "@leetype/lib/leetype/notes/dictation"
import { Button, Textarea } from "@some-ui/shared"
import { Mic, NotebookPen, Square } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * Who turns speech into text, said before the learner first speaks (canon
 * Rem. 3.7): the audio may leave the device through the platform's
 * recognizer, though this app keeps only the words.
 */
const RECOGNIZER_DISCLOSURE: Readonly<Record<Dictation["recognizer"], string>> =
  {
    browser:
      "Your browser's speech service turns what you say into text, and may send the audio to its maker to do it. Only the text is kept, on this device.",
    phone:
      "Your phone's speech service turns what you say into text. Only the text is kept, on this device.",
  }

type NoteButtonProps = {
  /** The artifact a note raised now would be on, for the accessible name. */
  label: string
  open: boolean
  onPress: () => void
}

/**
 * The one way in to a margin note: always present beside the round's tabs,
 * so a note is one tap from whatever is showing (canon Rem. 3.7).
 */
export const NoteButton: FC<NoteButtonProps> = ({ label, open, onPress }) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    aria-expanded={open}
    aria-label={open ? "Close the note" : `Note on ${label}`}
    className={cn("min-h-11 gap-1.5 px-2.5", open && "text-foreground")}
    onClick={onPress}
  >
    <NotebookPen className="size-4" aria-hidden="true" />
    <span className="text-xs">Note</span>
  </Button>
)

type NoteComposerProps = {
  state: ComposerState
  dispatch: (intent: ComposerIntent) => void
  /** The label of the artifact the open note is on. */
  label: string
  /** Whose recognizer listens, or null where none does. */
  recognizer: Dictation["recognizer"] | null
  className?: string
}

/**
 * The margin-note panel (canon Rem. 3.7), inline under the tabs, never over
 * the round. It renders `../../../lib/leetype/notes/composer`'s state and
 * turns taps into intents; the runtime owns the recognizer.
 *
 * Choosing a kind saves the note. Words are optional and added after, by
 * voice or by typing; Done or the Note button closes the panel, keeping
 * everything said.
 */
export const NoteComposer: FC<NoteComposerProps> = ({
  state,
  dispatch,
  label,
  recognizer,
  className,
}) => {
  const textId = useId()
  const { composer, notice } = state
  const status = (
    <p aria-live="polite" className="sr-only">
      {notice}
    </p>
  )
  if (composer.phase === "closed") return status

  if (composer.phase === "choosing") {
    return (
      <section
        aria-label={`Note on ${label}`}
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3",
          className
        )}
      >
        {status}
        <p className="text-sm font-medium text-foreground">
          What is getting in the way on {label.toLowerCase()}?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {NOTE_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left text-sm"
              onClick={() => dispatch({ type: "kindPicked", kind })}
            >
              {NOTE_KIND_COPY[kind].label}
            </Button>
          ))}
        </div>
      </section>
    )
  }

  const listening = isListening(composer)
  const finishing = composer.voice.kind === "finishing"
  return (
    <section
      aria-label={`Note on ${label}`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3",
        className
      )}
    >
      {status}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Noted on {label.toLowerCase()}:{" "}
          <span className="font-medium text-foreground">
            {NOTE_KIND_COPY[composer.note.kind].label}
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={() => dispatch({ type: "undoPressed" })}
        >
          Undo
        </Button>
      </div>
      <label htmlFor={textId} className="sr-only">
        Add words to the note
      </label>
      <Textarea
        id={textId}
        value={draftOf(composer)}
        maxLength={NOTE_TEXT_MAX}
        readOnly={listening}
        rows={2}
        placeholder={
          listening
            ? "Listening…"
            : recognizer === null
              ? "Add words, if you like"
              : "Add words, if you like: say them or type them"
        }
        className="min-h-16 text-base"
        onChange={(event) =>
          dispatch({ type: "textEdited", text: event.target.value })
        }
      />
      <div className="flex items-center gap-2">
        {recognizer !== null && state.canListen && (
          <Button
            type="button"
            variant={listening ? "secondary" : "outline"}
            className="min-h-11 gap-1.5"
            aria-pressed={listening}
            disabled={finishing}
            onClick={() => dispatch({ type: "micPressed" })}
          >
            {listening ? (
              <Square className="size-4" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )}
            {finishing ? "Finishing…" : listening ? "Stop" : "Speak"}
          </Button>
        )}
        <Button
          type="button"
          className="ml-auto min-h-11"
          onClick={() => dispatch({ type: "donePressed" })}
        >
          Done
        </Button>
      </div>
      {notice !== "" && notice !== COMPOSER_NOTICES.saved && (
        <p className="text-pretty text-xs text-muted-foreground">{notice}</p>
      )}
      {recognizer !== null && state.canListen && (
        <p className="text-pretty text-xs text-muted-foreground">
          {RECOGNIZER_DISCLOSURE[recognizer]}
        </p>
      )}
    </section>
  )
}

import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { useSpeaker } from "@some-ui/speech"
import { ChatPanel } from "@topik/components/topik/chat-panel"
import type { ConversationBatch, Message, PlayState } from "@topik/lib/topik"
import { lineText } from "@topik/lib/topik/adapter/hooks/use-handheld-lesson"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"
import { cn } from "some-ui-utils"

type ConversationPreviewProps = {
  /** The lesson as it will be served: `intakeLesson`'s `batches`. */
  batches: Array<ConversationBatch>
  /** How long each line stays before the next appears while playing. */
  lineMs?: number
}

/**
 * A lesson's conversations, played as the desktop study session's chat plays
 * them - the same `ChatPanel`, driven here by a small local player instead of
 * the session machine, so there is no quiz, no progress and nothing stored.
 *
 * For whoever is about to serve a lesson (the operator's lesson CRM): it
 * shows what learners will read, one conversation at a time. The phone's
 * handheld lesson presents the same lines as cards rather than a chat.
 *
 * Lines are spoken when a `<SpeechProvider>` is mounted, as in the session;
 * without one the speak button does nothing.
 *
 * It fills the box its host gives it (`h-full`), so the host decides how
 * tall a preview is; it has no fixed height of its own.
 */
export const ConversationPreview = ({
  batches,
  lineMs = 1200,
}: ConversationPreviewProps): JSX.Element => {
  const [selected, setSelected] = useState(0)
  // How many lines of the selected conversation are showing: all of them to
  // begin with, so the preview reads at once; Play replays them line by line.
  const [shown, setShown] = useState(() => batches[0]?.messages.length ?? 0)
  const [playState, setPlayState] = useState<PlayState>("paused")
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const speech = useSpeaker()
  const utterance = useRef<AbortController | null>(null)

  // The lesson under the preview can change under it (the operator edits the
  // text): a conversation that no longer exists falls back to the first.
  const index = selected < batches.length ? selected : 0
  const messages = batches[index]?.messages ?? []

  // Playing stops by itself at the last line: derived, not stored, so there
  // is no state to reset when it gets there.
  const running = playState === "running" && shown < messages.length

  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => setShown((count) => count + 1), lineMs)
    return (): void => clearTimeout(timer)
  }, [running, shown, lineMs])

  useEffect(
    () => (): void => {
      utterance.current?.abort()
    },
    []
  )

  const choose = (next: number): void => {
    setSelected(next)
    setShown(batches[next]?.messages.length ?? 0)
    setPlayState("paused")
  }

  const play = (): void => {
    // Playing a finished conversation starts it over.
    if (shown >= messages.length) setShown(0)
    setPlayState("running")
  }

  const speak = async (message: Message): Promise<void> => {
    if (!speech) return
    utterance.current?.abort()
    const controller = new AbortController()
    utterance.current = controller
    try {
      await speech.say(lineText(message), {
        lang: SPOKEN_LANGUAGE,
        signal: controller.signal,
        onStart: () => setSpeakingId(message.id),
      })
    } catch {
      // Cancelled, or speech failed: the line is still there to read.
    } finally {
      if (utterance.current === controller) setSpeakingId(null)
    }
  }

  return (
    <div
      data-slot="topik-conversation-preview"
      className="flex h-full min-h-0 flex-col gap-2"
    >
      {batches.length > 1 && (
        <div
          role="tablist"
          aria-label="Conversations"
          className="flex shrink-0 flex-wrap gap-1"
        >
          {batches.map((batch, position) => (
            <button
              key={batch.id}
              type="button"
              role="tab"
              aria-selected={position === index}
              onClick={() => choose(position)}
              className={cn(
                "rounded-lg border px-2 py-1 text-xs",
                position === index
                  ? "border-primary/40 bg-primary/15"
                  : "border-border hover:bg-muted"
              )}
            >
              Conversation {batch.id} · {batch.messages.length} lines
              {batch.probes?.length ? ` · ${batch.probes.length} probes` : ""}
            </button>
          ))}
        </div>
      )}
      {/* The chat takes what its host gives it: the preview has no height of
          its own to impose, and the chat scrolls inside itself. */}
      <div className="min-h-0 flex-1">
        <ChatPanel
          messages={messages}
          visibleMessages={messages.slice(0, shown)}
          currentMessageIndex={Math.max(shown - 1, 0)}
          playState={running ? "running" : "paused"}
          onPlay={play}
          onPause={() => setPlayState("paused")}
          onReset={() => {
            setShown(0)
            setPlayState("paused")
          }}
          onJumpToMessage={(position) => {
            setShown(position + 1)
            setPlayState("paused")
          }}
          onSpeakMessage={speak}
          isQuizActive={false}
          currentlySpeakingId={speakingId}
        />
      </div>
    </div>
  )
}

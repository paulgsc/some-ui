import type { JSX } from "react"
import type { Message, PlayState } from "@topik/lib/topik"
import {
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react"
import { Button, Card, ScrollArea, WithAvatar } from "@some-ui/shared"
import { cn } from "some-ui-utils"

type ChatPanelProps = {
  messages: Array<Message>
  visibleMessages: Array<Message>
  currentMessageIndex: number
  playState: PlayState
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onJumpToMessage: (index: number) => void
  onSpeakMessage: (message: Message) => Promise<void>
  isQuizActive: boolean
  currentlySpeakingId: string | null
  isLoading?: boolean
}

const avatar = {
  src: "https://github.com/shadcn.png",
  alt: "@shadcn",
  fallback: "CN",
}

export const ChatPanel = ({
  messages,
  visibleMessages,
  currentMessageIndex,
  playState,
  onPlay,
  onPause,
  onReset,
  onJumpToMessage,
  onSpeakMessage,
  isQuizActive,
  currentlySpeakingId,
  isLoading = false,
}: ChatPanelProps): JSX.Element => {
  const isRunning = playState === "running"
  const isPaused = playState === "paused"
  const hasContent = messages.length > 0

  return (
    <Card className="h-full flex flex-col border-2 overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <MessageCircle className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-sm">Conversation</h2>
            <p className="text-xs text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Fetching
                  content...
                </span>
              ) : hasContent ? (
                isQuizActive ? (
                  "Assessment in progress"
                ) : (
                  `Message ${currentMessageIndex + 1} of ${messages.length}`
                )
              ) : (
                "Select a topic to begin"
              )}
            </p>
          </div>
          <div
            className={cn(
              "size-2 rounded-full",
              isRunning
                ? "bg-green-500 animate-pulse"
                : hasContent
                  ? "bg-blue-500"
                  : "bg-gray-400"
            )}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {!hasContent && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-50">
            <MessageCircle className="size-8 mb-2" />
            <p className="text-sm font-medium">No Active Session</p>
            <p className="text-xs">
              Select a study material from the header to load the conversation.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {visibleMessages.map((message, index) => {
            const isActive = index === currentMessageIndex && isRunning
            const isSpeaking = currentlySpeakingId === message.id

            return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : "",
                  isActive &&
                    "animate-in fade-in slide-in-from-bottom-2 duration-500"
                )}
              >
                <WithAvatar
                  className="pointer-events-none z-10 shrink-0 brightness-75"
                  avatarSize={25}
                  avatar={avatar}
                />
                <div
                  className={cn(
                    "flex-1",
                    message.role === "user" ? "text-right" : ""
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "inline-block p-3 rounded-2xl text-sm leading-relaxed cursor-pointer transition-all border-2",
                      message.role === "assistant"
                        ? "bg-muted text-foreground border-transparent"
                        : "bg-primary text-primary-foreground border-transparent",
                      isActive && "border-primary/40 ring-4 ring-primary/10",
                      "hover:border-primary/50"
                    )}
                    onClick={() => onJumpToMessage(index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onJumpToMessage(index)
                      }
                    }}
                  >
                    {message.content}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void onSpeakMessage(message)
                      }}
                      className="ml-2 inline-flex items-center justify-center size-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      disabled={isSpeaking}
                    >
                      <Volume2
                        className={cn(
                          "size-3",
                          isSpeaking && "animate-pulse text-accent"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 px-1">
                    {message.role} • {message.timestamp}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/20 space-y-3">
        <div className="flex items-center justify-center gap-2">
          {!isRunning ? (
            <Button
              onClick={onPlay}
              size="sm"
              disabled={isQuizActive || !hasContent || isLoading}
            >
              <Play className="size-4 mr-1" />
              {isPaused ? "Resume" : "Play"}
            </Button>
          ) : (
            <Button onClick={onPause} size="sm" variant="secondary">
              <Pause className="size-4 mr-1" />
              Pause
            </Button>
          )}
          <Button
            onClick={onReset}
            size="sm"
            variant="outline"
            disabled={isRunning || !hasContent}
          >
            <RotateCcw className="size-4 mr-1" />
            Reset
          </Button>
        </div>
        <div className="text-[10px] text-center text-muted-foreground uppercase tracking-tight">
          {isQuizActive
            ? "Complete assessment to unlock chat"
            : !hasContent
              ? "Waiting for selection..."
              : "Interactive Mode: Click to Seek"}
        </div>
      </div>
    </Card>
  )
}

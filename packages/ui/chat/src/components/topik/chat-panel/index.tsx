import type { ChatPlayState, Message } from "@chat/types/topik"
import { MessageCircle, Pause, Play, RotateCcw, Volume2 } from "lucide-react"
import { Button, Card, ScrollArea, WithAvatar } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ChatPanelProps = {
  messages: Array<Message>
  visibleMessages: Array<Message>
  currentMessageIndex: number
  playState: ChatPlayState
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onJumpToMessage: (index: number) => void
  onSpeakMessage: (message: Message) => void
  isQuizActive: boolean
  currentlySpeakingId: string | null
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
}: ChatPanelProps) => {
  return (
    <Card className="h-full flex flex-col border-2">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <MessageCircle className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-sm">Conversation Context</h2>
            <p className="text-xs text-muted-foreground">
              {playState !== "not started" &&
                (isQuizActive
                  ? "Assessment in progress"
                  : `${currentMessageIndex + 1} / ${messages.length} messages`)}
            </p>
          </div>
          <div
            className={`size-2 rounded-full ${
              playState === "playing"
                ? "bg-green-500 animate-pulse"
                : playState === "finished"
                  ? "bg-blue-500"
                  : "bg-gray-400"
            }`}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {playState !== "not started" &&
            visibleMessages.map((message, index) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""} ${
                  index === currentMessageIndex && playState === "playing"
                    ? "animate-in fade-in slide-in-from-bottom-2 duration-500"
                    : ""
                }`}
              >
                <WithAvatar
                  className={cn(
                    "pointer-events-none z-10 shrink-0 brightness-75"
                  )}
                  avatarSize={25}
                  avatar={avatar}
                />
                <div
                  className={`flex-1 ${message.role === "user" ? "text-right" : ""}`}
                >
                  <div
                    className={`inline-block p-3 rounded-2xl text-sm leading-relaxed cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${
                      message.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                    onClick={() => onJumpToMessage(index)}
                  >
                    {message.content}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSpeakMessage(message)
                      }}
                      className="ml-2 inline-flex items-center justify-center size-6 rounded-full hover:bg-background/20 transition-colors"
                      disabled={currentlySpeakingId === message.id}
                    >
                      <Volume2
                        className={`size-3 ${currentlySpeakingId === message.id ? "animate-pulse text-primary" : ""}`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 px-1">
                    {message.timestamp}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/20 space-y-3">
        <div className="flex items-center justify-center gap-2">
          {playState !== "playing" && (
            <Button onClick={onPlay} size="sm" disabled={isQuizActive}>
              <Play className="size-4 mr-1" />
              Play
            </Button>
          )}
          {playState === "playing" && (
            <Button onClick={onPause} size="sm" variant="secondary">
              <Pause className="size-4 mr-1" />
              Pause
            </Button>
          )}
          <Button
            onClick={onReset}
            size="sm"
            variant="outline"
            disabled={playState === "playing"}
          >
            <RotateCcw className="size-4 mr-1" />
            Reset
          </Button>
        </div>
        <div className="text-xs text-center text-muted-foreground">
          {isQuizActive
            ? "Complete assessment to continue"
            : "Click messages to jump or listen"}
        </div>
      </div>
    </Card>
  )
}

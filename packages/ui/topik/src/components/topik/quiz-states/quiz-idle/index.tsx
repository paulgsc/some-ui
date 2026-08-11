import type { JSX } from "react"
import { Card } from "@some-ui/shared"
import type { PlayState } from "@topik/lib/topik"
import { GraduationCap, Play } from "lucide-react"

type QuizIdleProps = {
  chatPlayState: PlayState
}

export const QuizIdle = ({ chatPlayState }: QuizIdleProps): JSX.Element => {
  const isPlaying = chatPlayState === "running"

  return (
    <Card className="flex h-full min-h-0 items-center justify-center overflow-hidden border-2 border-dashed p-6">
      <div className="max-w-lg space-y-4 text-center">
        <div className="bg-primary/10 inline-flex items-center justify-center rounded-2xl p-3">
          <GraduationCap className="text-primary size-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Standby Mode</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isPlaying
              ? "Watch the conversation unfold. Assessment will begin when the conversation finishes."
              : "Click Play in the chat panel to start the conversation."}
          </p>
        </div>
        {isPlaying && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="text-primary flex items-center gap-2">
              <Play className="size-4 animate-pulse" />
              <span className="text-sm font-medium">
                Conversation playing...
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

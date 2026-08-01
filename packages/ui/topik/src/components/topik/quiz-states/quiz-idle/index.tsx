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
    <Card className="h-full border-2 border-dashed flex items-center justify-center p-12">
      <div className="text-center max-w-lg space-y-6">
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-2xl">
          <GraduationCap className="size-16 text-primary" />
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight">Standby Mode</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {isPlaying
              ? "Watch the conversation unfold. Assessment will begin when the conversation finishes."
              : "Click Play in the chat panel to start the conversation."}
          </p>
        </div>
        {isPlaying && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <div className="flex items-center gap-2 text-primary">
              <Play className="size-5 animate-pulse" />
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

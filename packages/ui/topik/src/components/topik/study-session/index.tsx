import type { FC, JSX } from "react"
import { ChatPanel } from "@topik/components/topik/chat-panel"
import { QuizPanel } from "@topik/components/topik/quiz-panel"
import { SessionHeader } from "@topik/components/topik/session-header"
import { useKoreanStudyPageVM } from "@topik/lib/topik"

export const KoreanStudyPage: FC = (): JSX.Element => {
  const vm = useKoreanStudyPageVM()

  return (
    <div className="dark topik absolute inset-0 topik flex flex-col dark:bg-background">
      <SessionHeader {...vm.header} />
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            {...vm.chat}
            onPlay={vm.actions.startChat}
            onPause={vm.actions.pauseChat}
            onReset={vm.actions.resetSession}
            onJumpToMessage={vm.actions.jumpToMessage}
          />
        </div>
        <div className="flex-1 topik-card">
          <QuizPanel
            {...vm.quiz}
            onAnswerSubmit={vm.actions.submitAnswer}
            onNextQuestion={vm.actions.advanceQuestion}
            onAssessmentComplete={(passed) =>
              passed ? vm.actions.passBatch() : vm.actions.failBatch()
            }
          />
        </div>
      </div>
    </div>
  )
}

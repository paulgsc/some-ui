import type { FC, JSX } from "react"
import { ChatPanel } from "@chat/components/topik/chat-panel"
import { QuizPanel } from "@chat/components/topik/quiz-panel"
import { SessionHeader } from "@chat/components/topik/session-header"
import { useKoreanStudyPageVM } from "@chat/lib/topik"

export const KoreanStudyPage: FC = (): JSX.Element => {
  const vm = useKoreanStudyPageVM()

  return (
    <div className="absolute inset-0 topik flex flex-col bg-background">
      <SessionHeader {...vm.header} />

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            {...vm.chat}
            {...vm.tts}
            onPlay={vm.actions.startChat}
            onPause={vm.actions.pauseChat}
            onReset={vm.actions.resetSession}
            onJumpToMessage={vm.actions.jumpToMessage}
          />
        </div>

        <div className="flex-1">
          <QuizPanel
            {...vm.quiz}
            {...vm.tts}
            onStartQuiz={vm.actions.startQuiz}
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

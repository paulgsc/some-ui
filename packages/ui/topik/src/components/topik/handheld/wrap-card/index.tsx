import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { Message } from "@topik/lib/topik"
import type { LessonTally } from "@topik/lib/topik/core/lesson-track"
import { ChevronRight, Library, RotateCcw } from "lucide-react"

type WrapCardProps = {
  conversation: number
  conversationCount: number
  tally: LessonTally
  lines: Array<Message>
  finished: boolean
  short: boolean
  onNextConversation: () => void
  onReplay: () => void
  onStartOver: () => void
  onChooseMaterial: () => void
}

/**
 * The end of a conversation: a tally for the learner, never a verdict. There
 * is no pass/fail on this surface (adaptive-learning canon Cor. 4.4 (i)) -
 * misses were already revisited, one at a time, instead of replaying the
 * batch (Rem. 4.3). The whole transcript is open now, to read back through.
 */
export const WrapCard = ({
  conversation,
  conversationCount,
  tally,
  lines,
  finished,
  short,
  onNextConversation,
  onReplay,
  onStartOver,
  onChooseMaterial,
}: WrapCardProps): JSX.Element => {
  const stage = (
    <div data-slot="topik-wrap" className="flex w-full flex-col gap-4">
      <div className="text-center">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {finished
            ? "Material complete"
            : `Conversation ${conversation + 1} of ${conversationCount}`}
        </p>
        <p className="mt-1 text-lg font-semibold">
          {tally.total === 0
            ? "Heard it through."
            : `${tally.firstTry} of ${tally.total} understood on the first listen`}
        </p>
        {tally.revisited > 0 && (
          <p className="text-muted-foreground text-sm">
            {tally.revisited} revisited after the conversation
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.id} className="border-border rounded-xl border p-3">
            <p lang="ko" className="font-medium break-keep">
              {line.korean || line.content}
            </p>
            <p className="text-muted-foreground text-sm">{line.english}</p>
          </li>
        ))}
      </ol>
    </div>
  )

  const dock = finished ? (
    <>
      <Button
        className="h-12 rounded-2xl w-full gap-2"
        onClick={onChooseMaterial}
      >
        <Library className="size-5" /> Choose material
      </Button>
      <Button
        variant="outline"
        className="h-12 rounded-2xl w-full gap-2"
        onClick={onStartOver}
      >
        <RotateCcw className="size-5" /> Start over
      </Button>
    </>
  ) : (
    <>
      <Button
        className="h-12 rounded-2xl w-full gap-2"
        onClick={onNextConversation}
      >
        {conversation + 1 < conversationCount ? "Next conversation" : "Finish"}
        <ChevronRight className="size-5" />
      </Button>
      <Button
        variant="outline"
        className="h-12 rounded-2xl w-full gap-2"
        onClick={onReplay}
      >
        <RotateCcw className="size-5" /> Hear this one again
      </Button>
    </>
  )

  return <StepLayout short={short} stage={stage} dock={dock} longForm />
}

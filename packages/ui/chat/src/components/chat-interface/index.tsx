import type { FC, RefObject } from "react"
import { useCallback, useRef } from "react"
import { ChatHeader } from "@chat/components/chat-header"
import { ChatMessages } from "@chat/components/chat-messages"
import type { ChatMessageProps } from "@chat/types/chat"
import type { AvatarGroupProps } from "some-ui-shared"
import { cn, useMeasureRect } from "some-ui-utils"

type ChatInterfaceProps = {
  className?: string
  chatMessagesClassName?: string
  characters: AvatarGroupProps["avatars"]
  messages: Array<ChatMessageProps>
  messagesHeight?: number
}

export const ChatInterface: FC<ChatInterfaceProps> = ({
  className,
  chatMessagesClassName,
  messages,
  characters,
  messagesHeight = 0.92,
}): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)

  const { height } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  const getChatHeight = useCallback(() => {
    if (!messagesHeight || messagesHeight < 0 || messagesHeight > 1)
      return height
    if (height) return messagesHeight * height
    return height
  }, [height, messagesHeight])

  const getHeaderHeight = useCallback(() => {
    if (!messagesHeight || messagesHeight < 0 || messagesHeight > 1)
      return height
    if (height) {
      const f = 1 - messagesHeight
      return f * height
    }
    return height
  }, [height, messagesHeight])

  return (
    <div ref={ref} className={cn("flex size-full flex-col", className)}>
      <ChatHeader characters={characters} height={getHeaderHeight()} />
      <ChatMessages
        className={chatMessagesClassName}
        messages={messages}
        height={getChatHeight()}
      />
    </div>
  )
}

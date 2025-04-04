import type { FC } from "react"
import { ChatHeader } from "@chat/components/chat-header"
import { ChatMessages } from "@chat/components/chat-messages"
import type { ChatMessageProps } from "@chat/types/chat"
import type { AvatarGroupProps } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ChatInterfaceProps = {
  className?: string
  chatMessagesClassName?: string
  characters: AvatarGroupProps["avatars"]
  messages: Array<ChatMessageProps>
}

export const ChatInterface: FC<ChatInterfaceProps> = ({
  className,
  chatMessagesClassName,
  messages,
  characters,
}): React.JSX.Element => {
  return (
    <div className={cn("flex size-full flex-col", className)}>
      <ChatHeader characters={characters} />
      <ChatMessages className={chatMessagesClassName} messages={messages} />
    </div>
  )
}

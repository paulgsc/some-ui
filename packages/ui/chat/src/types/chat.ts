import type { AvatarOptions } from "@some-ui/shared"

type MessageType = "chat" | "thinking"

export type Message = {
  id: string
  character: string
  position: "left" | "right"
  content: string
  type: MessageType
  timestamp: string
  avatar: AvatarOptions
  avatarSize?: number
}

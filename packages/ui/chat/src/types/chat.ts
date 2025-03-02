import type { AvatarOptions } from "some-ui-shared"

export type MessageType = "chat" | "thinking"
type User = "ai" | "pgdev"

export interface ChatMessage {
  id: string
  character: User
  content: string
  type: MessageType
  timestamp: string
  avatar: AvatarOptions
  avatarSize?: number
}

export interface Character {
  id: string
  name: string
  avatar: string
}

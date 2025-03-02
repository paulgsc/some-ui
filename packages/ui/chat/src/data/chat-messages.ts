import type { ChatMessage } from "@chat/types/chat"
import { formatRelativeTime } from "some-ui-utils"

import { pgdevPng } from "../../../../../assets"

export const mockMessages: Array<ChatMessage> = [
  {
    id: "1",
    character: "ai",
    content: "👋 Hi there! How can I help?",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "2",
    character: "pgdev",
    content: "I'm just browsing!",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "3",
    character: "ai",
    content:
      "No problem.\n\nIf you need help you can type below to ask a question 👇",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
]

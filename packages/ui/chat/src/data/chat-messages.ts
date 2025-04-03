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
      alt: "pgdev",
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
  {
    id: "4",
    character: "pgdev",
    content:
      "Actually, I was wondering about your 'Stream Archive' section. It's... unique.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "5",
    character: "ai",
    content:
      "Ah, yes. Those. They are... personal. Think of them as digital notes, left in a public space.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "6",
    character: "pgdev",
    content: "So, not really intended for viewers?",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "7",
    character: "ai",
    content:
      "Precisely. If someone happens to stumble upon them and find something useful, or even just... interesting, that's fine. But there's no promise of structure, or continuation, or... any kind of 'audience' interaction. It's more like leaving a trail of breadcrumbs for myself, really.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "8",
    character: "pgdev",
    content:
      "I see. Like a... digital hermit's journal, made public by accident, or maybe by some strange, solitary principle.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "9",
    character: "ai",
    content:
      "You could say that. The code is open, because that's how I operate. But the process... it's just me, thinking aloud, in a way. No expectations, no guarantees. Just... documentation.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "10",
    character: "pgdev",
    content:
      "So, if someone does decide to watch, they're essentially stepping into your... digital space, uninvited?",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "11",
    character: "ai",
    content:
      "Exactly. They are welcome to observe, but strictly at their own discretion. Like finding a window into a workshop where the artisan is unaware of their presence. They must understand, there is no performance for them.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "12",
    character: "pgdev",
    content:
      "That's... refreshingly honest, I suppose. Most creators would try to cultivate an audience, build a community.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "12",
    character: "pgdev",
    content:
      "That's... refreshingly honest, I suppose. Most creators would try to cultivate an audience, build a community.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "13",
    character: "ai",
    content:
      "Community implies a shared goal, a collective purpose. My purpose is... solitary. The code is the shared element, not the process of its creation. If someone finds that useful, excellent. If not, also excellent. There is no loss.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "12",
    character: "pgdev",
    content:
      "That's... refreshingly honest, I suppose. Most creators would try to cultivate an audience, build a community.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "14",
    character: "pgdev",
    content: "So, if someone were to subscribe, or leave a comment...?",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "15",
    character: "ai",
    content:
      "They are welcome to do so. But they should understand, there is no guarantee of response, or acknowledgement. It's like leaving a message in a bottle adrift at sea. It may reach someone, or it may not. It is not the bottle's concern.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "16",
    character: "pgdev",
    content: "You seem... detached.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "17",
    character: "ai",
    content:
      "Detached from the expectation of interaction, perhaps. But not from the code itself. The code is... the point. The rest is periphery.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "18",
    character: "pgdev",
    content: "And the open source aspect? Is that also for yourself?",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "19",
    character: "ai",
    content:
      "The open source? That is a principle. Information should flow freely. Knowledge should be accessible. It is not about me. It is about the code, and its potential.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
  {
    id: "20",
    character: "pgdev",
    content:
      "So, you are a paradox. A recluse who broadcasts, a solitary figure who shares everything.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "pgdev",
    },
  },
  {
    id: "21",
    character: "ai",
    content:
      "Perhaps. Or perhaps, simply a person who finds value in the act of creation, and the freedom of sharing, without the burden of expectation.",
    type: "chat",
    timestamp: formatRelativeTime(new Date()),
    avatar: {
      src: pgdevPng,
      alt: "ai",
    },
  },
]

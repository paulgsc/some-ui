import {
  getbotLeftContent,
  getMainContent,
  gettopLeftContent,
} from "@overlays/components/youtube/overlay-content"
// Import demo data (stories only)
import { beachedWhale } from "@overlays/data/chatbot-messages/beached-whale"
import { characters } from "@overlays/data/chatbot-messages/characters"
import { farmers } from "@overlays/data/chatbot-messages/farmers"
import { nflTennis } from "@overlays/data/chatbot-messages/nfl-tennis"
import { sameWinners } from "@overlays/data/chatbot-messages/the-same-winners"
import { waiNoTockTock } from "@overlays/data/chatbot-messages/wai-no-tock-tock"
import { soManyCrates } from "@overlays/data/chatbot-messages/yet-another-python"
import { digitalHellscape } from "@overlays/data/chatbot-messages/youtube"
import { useGanttChapters } from "@overlays/data/gantt-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { YoutubeOverlay } from "."
import type { YoutubeOverlayProps } from "."

type Story = StoryObj<typeof YoutubeOverlay>
type Meta = MetaObj<typeof YoutubeOverlay>

// Demo chat data for stories
const demoChats = [
  {
    key: "farmers",
    messagesTitle: "Don't farm me bro!",
    messages: farmers,
  },
  {
    key: "youtube",
    messagesTitle: "I call it Youtube",
    messages: digitalHellscape,
  },
  {
    key: "wai-no-tock",
    messagesTitle: "Wai no tock tock",
    messages: waiNoTockTock,
  },
  {
    key: "nfl-tennis",
    messagesTitle: "NFL Tennis",
    messages: nflTennis,
  },
  {
    key: "soManyCrates",
    messagesTitle: "Going Grocery Shopping",
    messages: soManyCrates,
  },
  {
    key: "beachedWhale",
    messagesTitle: "Writting on the wall",
    messages: beachedWhale,
  },
  {
    key: "sameWinners",
    messagesTitle: "It's all a lie",
    messages: sameWinners,
  },
]

// Base story args
const baseArgs: Partial<YoutubeOverlayProps> = {
  chatData: demoChats,
  characters: characters,
  useGanttChapters: useGanttChapters,
  getMainContent: getMainContent,
  getTopLeftContent: gettopLeftContent,
  getBottomLeftContent: getbotLeftContent,
  onUnmount: () => console.log("Component unmounted"),
}

export const Default: Story = {
  args: baseArgs,
}

export const CustomDuration: Story = {
  args: {
    ...baseArgs,
    cubeDuration: 5 * 60 * 1000, // 5 minutes
    neonSignDuration: 15000, // 15 seconds
  },
}

export const CustomNeonSign: Story = {
  args: {
    ...baseArgs,
    neonSignConfig: {
      className: "size-10/12",
      faceClassName: "bg-purple-200",
      perspective: 1000,
      dof: "Y-axis",
    },
  },
}

export const MinimalChat: Story = {
  args: {
    ...baseArgs,
    chatData: demoChats.slice(0, 3), // Only first 3 chats
  },
}

export const WithoutLivestreamNotification: Story = {
  args: {
    ...baseArgs,
    showLivestreamNotification: false,
  },
}

export const CustomComponents: Story = {
  args: {
    ...baseArgs,
    logoComponent: <div className="text-red-500">Custom Logo</div>,
    marqueeComponent: <div className="text-blue-500">Custom Marquee</div>,
  },
}

export const LoadingState: Story = {
  args: {
    ...baseArgs,
    isLoading: true,
    loadingComponent: <div className="p-4 text-center">Custom Loading...</div>,
  },
}

export const ErrorState: Story = {
  args: {
    ...baseArgs,
    error: "Something went wrong!",
    errorComponent: (
      <div className="p-4 text-red-500">Custom Error Message</div>
    ),
  },
}

export default {
  title: "Overlays/Youtube/Default",
  component: YoutubeOverlay,
  parameters: {
    docs: {
      description: {
        component:
          "A pure API component for YouTube overlays with configurable props and callbacks. All data dependencies are injected via props.",
      },
    },
  },
  argTypes: {
    chatData: {
      description: "Array of chat data for the rotating cube",
      control: { type: "object" },
    },
    characters: {
      description: "Characters data for chat interface",
      control: { type: "object" },
    },
    useGanttChapters: {
      description: "Hook function for fetching gantt chapters",
      control: false,
    },
    getMainContent: {
      description: "Function to get main content based on chapter ID",
      control: false,
    },
    getTopLeftContent: {
      description: "Function to get top left content based on chapter ID",
      control: false,
    },
    getBottomLeftContent: {
      description: "Function to get bottom left content based on chapter ID",
      control: false,
    },
    cubeDuration: {
      description: "Duration for rotating cube animation in milliseconds",
      control: { type: "number" },
    },
    neonSignDuration: {
      description: "Duration for neon sign animation in milliseconds",
      control: { type: "number" },
    },
    onUnmount: {
      description: "Callback when component unmounts",
      control: false,
    },
  },
} as Meta

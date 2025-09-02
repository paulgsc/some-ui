import {
  getbotLeftContent,
  getMainContent,
  gettopLeftContent,
} from "@some-ui/content/components/overlay"
import { beachedWhale } from "@some-ui/content/data/chatbot-messages/beached-whale"
import { characters } from "@some-ui/content/data/chatbot-messages/characters"
import { farmers } from "@some-ui/content/data/chatbot-messages/farmers"
import { nflTennis } from "@some-ui/content/data/chatbot-messages/nfl-tennis"
import { sameWinners } from "@some-ui/content/data/chatbot-messages/the-same-winners"
import { waiNoTockTock } from "@some-ui/content/data/chatbot-messages/wai-no-tock-tock"
import { soManyCrates } from "@some-ui/content/data/chatbot-messages/yet-another-python"
import { digitalHellscape } from "@some-ui/content/data/chatbot-messages/youtube"
import { useGanttChapters } from "@some-ui/content/data/gantt-data"
import { createFileRoute } from "@tanstack/react-router"
import { YoutubeOverlay } from "overlays"

// Demo chat data
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

// Search params validation (optional)
type YouTubeOverlaySearch = {
  cubeDuration?: number
  neonSignDuration?: number
  showLivestreamNotification?: boolean
}

export const Route = createFileRoute("/overlays/youtube")({
  validateSearch: (search: Record<string, unknown>): YouTubeOverlaySearch => {
    return {
      cubeDuration: search.cubeDuration
        ? Number(search.cubeDuration)
        : undefined,
      neonSignDuration: search.neonSignDuration
        ? Number(search.neonSignDuration)
        : undefined,
      showLivestreamNotification: search.showLivestreamNotification !== "false",
    }
  },
  component: YouTubeOverlayRoute,
})

const YouTubeOverlayRoute = () => {
  const { cubeDuration, neonSignDuration, showLivestreamNotification } =
    Route.useSearch()

  const handleUnmount = () => {
    console.log("YouTube Overlay component unmounted")
  }

  return (
    <div className="h-screen w-screen">
      <YoutubeOverlay
        chatData={demoChats}
        characters={characters}
        useGanttChapters={useGanttChapters}
        getMainContent={getMainContent}
        getTopLeftContent={gettopLeftContent}
        getBottomLeftContent={getbotLeftContent}
        cubeDuration={cubeDuration}
        neonSignDuration={neonSignDuration}
        showLivestreamNotification={showLivestreamNotification}
        onUnmount={handleUnmount}
      />
    </div>
  )
}

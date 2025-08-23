import { useEffect } from "react"
import { YoutubeMarquee } from "@overlays/components"
import Logo from "@overlays/components/youtube/logo"
import {
  getbotLeftContent,
  getMainContent,
  gettopLeftContent,
} from "@overlays/components/youtube/overlay-content"
import { beachedWhale } from "@overlays/data/chatbot-messages/beached-whale"
import { characters } from "@overlays/data/chatbot-messages/characters"
import { farmers } from "@overlays/data/chatbot-messages/farmers"
import { nflTennis } from "@overlays/data/chatbot-messages/nfl-tennis"
import { sameWinners } from "@overlays/data/chatbot-messages/the-same-winners"
import { waiNoTockTock } from "@overlays/data/chatbot-messages/wai-no-tock-tock"
import { soManyCrates } from "@overlays/data/chatbot-messages/yet-another-python"
import { digitalHellscape } from "@overlays/data/chatbot-messages/youtube"
import { useGanttChapters } from "@overlays/data/gantt-data"
import { ChatInterface } from "some-ui-chat"
import { RotatingCube, RotatingNeonSign } from "some-ui-slideshow"
import { LivestreamTopicNotification } from "some-ui-stepper"
import { useLocalStorage } from "some-ui-utils"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

const YoutubeOverlay = (): React.JSX.Element => {
  const params = {
    range: "gantt!A1:L20",
  }
  const { data: chapters } = useGanttChapters({ ...params })
  const { value: currentChapterId, removeValue } = useLocalStorage(
    "gantt-chapter",
    chapters ? "none" : "none"
  )
  const cubeFaces = [
    <ChatInterface
      key={"farmers"}
      messagesTitle={"Don't farm me bro!"}
      messages={farmers}
      characters={characters}
    />,

    <ChatInterface
      key={"youtube"}
      messagesTitle={"I call it Youtube"}
      messages={digitalHellscape}
      characters={characters}
    />,

    <ChatInterface
      key={"wai-no-tock"}
      messagesTitle={"Wai no tock tock"}
      messages={waiNoTockTock}
      characters={characters}
    />,
    <ChatInterface
      key={"nf-tennis"}
      messagesTitle={"NFL Tennis"}
      messages={nflTennis}
      characters={characters}
    />,
    <ChatInterface
      key={"soManyCrates"}
      messagesTitle={"Going Grocery Shopping"}
      messages={soManyCrates}
      characters={characters}
    />,
    <ChatInterface
      key={"beachedWhale"}
      messagesTitle={"Writting on the wall"}
      messages={beachedWhale}
      characters={characters}
    />,
    <ChatInterface
      key={"sameWinners"}
      messagesTitle={"It's all a lie"}
      messages={sameWinners}
      characters={characters}
    />,
  ]
  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: (
      <RotatingCube
        content={cubeFaces}
        duration={10 * 60 * 1000}
        hideBackface={true}
      />
    ),
    [WireframeRegion.MARQUEE]: (
      <RotatingNeonSign
        className="size-11/12"
        faceClassName="bg-sky-200"
        perspective={1250}
        dof="X-axis"
        duration={30000}
      />
    ),
    [WireframeRegion.MAIN_CONTENT]: getMainContent(currentChapterId),
    [WireframeRegion.FOOTER_LEFT]: <Logo />,
    [WireframeRegion.SIDEBAR_TOP]: gettopLeftContent(currentChapterId),
    [WireframeRegion.SIDEBAR_BOTTOM]: getbotLeftContent(currentChapterId),
    [WireframeRegion.FOOTER_RIGHT]: <YoutubeMarquee />,
  }

  useEffect(() => {
    return (): void => {
      removeValue()
    }
  }, [chapters, removeValue])

  //  if (isLoading) return <div>Loading...</div>
  // if (error) return <div>error...{`${error}`}</div>

  const totalDuration =
    chapters?.reduce((max, chapter) => Math.max(max, chapter.endTime), 0) ?? 0

  return (
    <>
      <YoutubeWireframe
        chapters={chapters ?? []}
        totalDuration={totalDuration}
        content={overlayContent}
      />
      <LivestreamTopicNotification />
    </>
  )
}

export default YoutubeOverlay

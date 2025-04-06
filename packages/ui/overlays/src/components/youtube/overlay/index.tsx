import { SplayAnimation, YoutubeMarquee } from "@overlays/components"
import Logo from "@overlays/components/youtube/logo"
import { getMainContent } from "@overlays/components/youtube/overlay-content"
import { beachedWhale } from "@overlays/data/chatbot-messages/beached-whale"
import { characters } from "@overlays/data/chatbot-messages/characters"
import { nflTennis } from "@overlays/data/chatbot-messages/nfl-tennis"
import { waiNoTockTock } from "@overlays/data/chatbot-messages/wai-no-tock-tock"
import { useGanttChapters } from "@overlays/data/gantt-data"
import { ChatInterface } from "some-ui-chat"
import { BoredAnimation } from "some-ui-emoji-animations"
import { RotatingCube, RotatingNeonSign } from "some-ui-slideshow"
import { useLocalStorage } from "some-ui-utils"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

const YoutubeOverlay = (): React.JSX.Element => {
  const { value: currentChapterId } = useLocalStorage(
    "gantt-chapter",
    "credits"
  )
  const params = {
    range: "gantt!A1:L20",
  }
  const { data: chapters, isLoading } = useGanttChapters({ ...params })

  const cubeFaces = [
    <ChatInterface
      key={"wai-no-tock"}
      messages={waiNoTockTock}
      characters={characters}
    />,
    <ChatInterface
      key={"beachedWhale"}
      messages={nflTennis}
      characters={characters}
    />,
    <ChatInterface
      key={"beachedWhale"}
      messages={beachedWhale}
      characters={characters}
    />,
  ]
  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: (
      <RotatingCube content={cubeFaces} duration={1 * 60 * 1000} />
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
    [WireframeRegion.SIDEBAR_TOP]: (
      <BoredAnimation className="absolute inset-0 size-full" />
    ),
    [WireframeRegion.SIDEBAR_BOTTOM]: <SplayAnimation />,
    [WireframeRegion.FOOTER_RIGHT]: <YoutubeMarquee />,
  }

  if (isLoading) return <div>Loading...</div>
  // if (error) return <div>error...{`${error}`}</div>

  const totalDuration =
    chapters?.reduce((max, chapter) => Math.max(max, chapter.endTime), 0) ?? 0

  return (
    <YoutubeWireframe
      chapters={chapters ?? []}
      totalDuration={totalDuration}
      content={overlayContent}
    />
  )
}

export default YoutubeOverlay

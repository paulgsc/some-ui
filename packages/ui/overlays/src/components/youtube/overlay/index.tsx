import { useEffect } from "react"
import type { FC, ReactNode } from "react"
import { YoutubeMarquee } from "@overlays/components"
import Logo from "@overlays/components/youtube/logo"
import type { PanelContent } from "@overlays/types/panels"
import type { Message } from "some-ui-chat"
import { ChatInterface } from "some-ui-chat"
import type { AllowedRotationAxis, Chapter } from "some-ui-slideshow"
import { RotatingCube, RotatingNeonSign } from "some-ui-slideshow"
import { LivestreamTopicNotification } from "some-ui-stepper"
import { useLocalStorage } from "some-ui-utils"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

export type ChatData = {
  key: string
  messagesTitle: string
  messages: Array<Message> // Replace with proper message type
}

export type GanttParams = {
  range: string
}

export type NeonSignConfig = {
  className?: string
  faceClassName?: string
  perspective?: number
  dof?: AllowedRotationAxis
}

export type Character = {
  src: string
  alt: string
  fallback: string
}

export type YoutubeOverlayProps = {
  /** Array of chat data for the rotating cube */
  chatData: Array<ChatData>
  /** Characters data for chat interface */
  characters: Array<Character> // Replace with proper character type
  /** Hook for fetching gantt chapters data */
  useGanttChapters: (params: GanttParams) => { data: Array<Chapter> | null }
  /** Gantt chart parameters */
  ganttParams?: GanttParams
  /** Function to get main content based on chapter ID */
  getMainContent: (chapterId: string) => ReactNode
  /** Function to get top left content based on chapter ID */
  getTopLeftContent: (chapterId: string) => PanelContent
  /** Function to get bottom left content based on chapter ID */
  getBottomLeftContent: (chapterId: string) => PanelContent
  /** Rotating cube duration in milliseconds */
  cubeDuration?: number
  /** Rotating neon sign duration in milliseconds */
  neonSignDuration?: number
  /** Neon sign configuration */
  neonSignConfig?: NeonSignConfig
  /** Local storage key for current chapter */
  chapterStorageKey?: string
  /** Custom logo component */
  logoComponent?: ReactNode
  /** Custom marquee component */
  marqueeComponent?: ReactNode
  /** Show livestream topic notification */
  showLivestreamNotification?: boolean
  /** Loading state */
  isLoading?: boolean
  /** Error state */
  error?: string | null
  /** Custom loading component */
  loadingComponent?: ReactNode
  /** Custom error component */
  errorComponent?: ReactNode
  /** Callback when component unmounts */
  onUnmount?: () => void
}

export const YoutubeOverlay: FC<YoutubeOverlayProps> = ({
  chatData,
  characters,
  useGanttChapters,
  ganttParams = { range: "gantt!A1:L20" },
  getMainContent,
  getTopLeftContent,
  getBottomLeftContent,
  cubeDuration = 10 * 60 * 1000,
  neonSignDuration = 30000,
  neonSignConfig = {
    className: "size-11/12",
    faceClassName: "bg-sky-200",
    perspective: 1250,
    dof: "X-axis",
  },
  chapterStorageKey = "gantt-chapter",
  logoComponent = <Logo />,
  marqueeComponent = <YoutubeMarquee />,
  showLivestreamNotification = true,
  isLoading = false,
  error = null,
  loadingComponent = <div>Loading...</div>,
  errorComponent = null,
  onUnmount,
}) => {
  const { data: chapters } = useGanttChapters(ganttParams)
  const { value: currentChapterId, removeValue } = useLocalStorage(
    chapterStorageKey,
    chapters ? "none" : "none"
  )

  const cubeFaces = chatData.map(({ key, messagesTitle, messages }) => (
    <ChatInterface
      key={key}
      messagesTitle={messagesTitle}
      messages={messages}
      characters={characters}
    />
  ))

  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: (
      <RotatingCube
        content={cubeFaces}
        duration={cubeDuration}
        hideBackface={true}
      />
    ),
    [WireframeRegion.MARQUEE]: (
      <RotatingNeonSign
        className={neonSignConfig.className}
        faceClassName={neonSignConfig.faceClassName}
        perspective={neonSignConfig.perspective}
        dof={neonSignConfig.dof}
        duration={neonSignDuration}
      />
    ),
    [WireframeRegion.MAIN_CONTENT]: getMainContent(currentChapterId),
    [WireframeRegion.FOOTER_LEFT]: logoComponent,
    [WireframeRegion.SIDEBAR_TOP]: getTopLeftContent(currentChapterId),
    [WireframeRegion.SIDEBAR_BOTTOM]: getBottomLeftContent(currentChapterId),
    [WireframeRegion.FOOTER_RIGHT]: marqueeComponent,
  }

  useEffect(() => {
    return (): void => {
      removeValue()
      onUnmount?.()
    }
  }, [chapters, removeValue, onUnmount])

  if (isLoading) return loadingComponent
  if (error) return errorComponent || <div>Error: {error}</div>

  const totalDuration =
    chapters?.reduce((max, chapter) => Math.max(max, chapter.endTime), 0) ?? 0

  return (
    <>
      <YoutubeWireframe
        chapters={chapters ?? []}
        totalDuration={totalDuration}
        content={overlayContent}
      />
      {showLivestreamNotification && <LivestreamTopicNotification />}
    </>
  )
}

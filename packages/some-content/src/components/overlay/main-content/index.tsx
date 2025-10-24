import type { FC, ReactNode } from "react"
import { Fragment, lazy, Suspense, useMemo } from "react"
import { getRandomSubarray, useObsOrchestrator } from "some-ui-utils"

// Lazy load all heavy components
const LazyEndingCredits = lazy(
  () => import("@content/components/overlay/ending-credits")
)
const LazyBrickChartCarousel = lazy(
  () => import("@content/components/overlay/brick-chart-carousel")
)
const LazyCrosswordPuzzle = lazy(
  () => import("@content/components/overlay/crossword-puzzle")
)

// Loading fallbacks
const LoadingCredits = (): ReactNode => (
  <div className="animate-pulse">Loading credits...</div>
)
const LoadingChart = (): ReactNode => (
  <div className="h-48 animate-pulse rounded bg-gray-200">Loading chart...</div>
)
const LoadingPuzzle = (): ReactNode => (
  <div className="h-96 animate-pulse rounded bg-gray-100">
    Loading crossword...
  </div>
)

// Factory functions that return lazy-wrapped components
const createLazyComponent = (
  LazyComponent: React.LazyExoticComponent<any>,
  fallback: ReactNode,
  props: any = {}
) => (
  <Suspense fallback={fallback}>
    <LazyComponent {...props} />
  </Suspense>
)

// Component factories
const createEndingCredits = (): ReactNode =>
  createLazyComponent(LazyEndingCredits, <LoadingCredits />)

const createBrickChartCarousel = (): ReactNode =>
  createLazyComponent(LazyBrickChartCarousel, <LoadingChart />)

const createCrosswordPuzzle = (): ReactNode =>
  createLazyComponent(LazyCrosswordPuzzle, <LoadingPuzzle />)

// Content type definitions for orchestration
export type ContentScene = {
  key: string
  duration: number // Duration in milliseconds
  factories: Array<() => ReactNode>
}

function toMilliseconds(hours: number, minutes: number): number {
  return hours * 60 * 60 * 1000 + minutes * 60 * 1000
}

// Default content configuration - you can customize this
const DEFAULT_CONTENT_SCENES: Array<ContentScene> = [
  {
    key: "intro",
    duration: toMilliseconds(3, 42), // 30 seconds
    factories: [() => <Fragment />], // Empty intro for now
  },
  {
    key: "crossword",
    duration: 15 * 1000,
    factories: [createCrosswordPuzzle],
  },
  {
    key: "nfl-tennis",
    duration: 60 * 1000,
    factories: [createBrickChartCarousel],
  },
  {
    key: "credits",
    duration: 2 * 60 * 1000, // 2 minutes
    factories: [createEndingCredits],
  },
  {
    key: "outro",
    duration: 15000, // 15 seconds
    factories: [() => <Fragment />], // Empty outro for now
  },
]

export type OrchestratedMainContentProps = {
  contentScenes?: Array<ContentScene>
  fallbackContent?: ReactNode
  onSceneChange?: (sceneKey: string, isActive: boolean) => void
  onStreamEnd?: () => void
  obsWebSocketUrl?: string
  autoStart?: boolean
}

export const OrchestratedMainContent: FC<OrchestratedMainContentProps> = ({
  contentScenes = DEFAULT_CONTENT_SCENES,
  fallbackContent = <Fragment />,
  onSceneChange,
  onStreamEnd,
  obsWebSocketUrl,
  autoStart = true,
}): ReactNode => {
  // Convert content scenes to OBS scene configs
  const obsScenes = useMemo(
    () =>
      contentScenes.map((scene) => ({
        sceneName: scene.key,
        duration: scene.duration,
      })),
    [contentScenes]
  )

  // Initialize orchestrator
  const orchestrator = useObsOrchestrator({
    scenes: obsScenes,
    obsWebSocketUrl,
    autoStart,
    onSceneChange,
    onStreamEnd,
  })

  // Get current active scene's content
  const activeContent = useMemo(() => {
    const activeSceneName = orchestrator.currentActiveScene

    if (!activeSceneName) {
      return fallbackContent
    }

    // Find the content scene configuration
    const activeContentScene = contentScenes.find(
      (scene) => scene.key === activeSceneName
    )

    if (!activeContentScene || activeContentScene.factories.length === 0) {
      return fallbackContent
    }

    // Get random factory and execute it
    const randomFactory = getRandomSubarray(activeContentScene.factories, 1)[0]
    return randomFactory()
  }, [orchestrator.currentActiveScene, contentScenes, fallbackContent])

  return activeContent
}

// Export orchestrator hook and data for use in stories
export const useOrchestratedContent = (props: OrchestratedMainContentProps) => {
  const {
    contentScenes = DEFAULT_CONTENT_SCENES,
    onSceneChange,
    onStreamEnd,
    obsWebSocketUrl,
    autoStart = true,
  } = props

  const obsScenes = useMemo(
    () =>
      contentScenes.map((scene) => ({
        sceneName: scene.key,
        duration: scene.duration,
      })),
    [contentScenes]
  )

  return useObsOrchestrator({
    scenes: obsScenes,
    obsWebSocketUrl,
    autoStart,
    onSceneChange,
    onStreamEnd,
  })
}

import type { FC, ReactNode } from "react"
import { Fragment, lazy, Suspense, useMemo } from "react"
import { getRandomSubarray, useObsOrchestrator } from "some-ui-utils"

// Your orchestrator hook

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

// Default content configuration - you can customize this
const DEFAULT_CONTENT_SCENES: Array<ContentScene> = [
  {
    key: "intro",
    duration: 30000, // 30 seconds
    factories: [() => <Fragment />], // Empty intro for now
  },
  {
    key: "crossword",
    duration: 15 * 60 * 1000, // 15 minutes
    factories: [createCrosswordPuzzle],
  },
  {
    key: "nfl-tennis",
    duration: 10 * 60 * 1000, // 10 minutes
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

  return (
    <div className="orchestrated-main-content">
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed right-4 top-4 z-50 rounded bg-black bg-opacity-75 p-2 text-xs text-white">
          <div>Scene: {orchestrator.currentActiveScene || "None"}</div>
          <div>Progress: {Math.round(orchestrator.sceneProgress * 100)}%</div>
          <div>
            Streaming: {orchestrator.obs.status.streaming ? "Yes" : "No"}
          </div>
          <div>Time: {orchestrator.obs.status.streamTimecode}</div>
        </div>
      )}

      {/* Main content area */}
      <div className="size-full">{activeContent}</div>

      {/* Optional controls - remove or conditionally show in production */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
          <button
            onClick={orchestrator.startStream}
            disabled={orchestrator.obs.status.streaming}
            className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Start Stream
          </button>
          <button
            onClick={orchestrator.stopStream}
            disabled={!orchestrator.obs.status.streaming}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Stop Stream
          </button>
          <button
            onClick={orchestrator.skipCurrentScene}
            disabled={!orchestrator.currentActiveScene}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Skip Scene
          </button>
        </div>
      )}
    </div>
  )
}

// index.tsx
import type { ReactNode } from "react"
import { Component, Fragment, lazy, Suspense } from "react"
import { accordionData } from "@content/data/gemini-stepper"
import type { PanelContent } from "@content/types/panels"
import { getRandomSubarray } from "some-ui-utils"

// ✅ ErrorBoundary for catching render crashes
class PanelErrorBoundary extends Component<
  { fallback?: ReactNode; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Panel crashed:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center h-full text-red-500">
            Panel failed to load
          </div>
        )
      )
    }
    return this.props.children
  }
}

// Lazy load all heavy components
const LazyEndingCredits = lazy(() => import("./ending-credits"))
const LazyBrickChartCarousel = lazy(() => import("./brick-chart-carousel"))
const LazyCrosswordPuzzle = lazy(() => import("./crossword-puzzle"))
const LazyCluesDown = lazy(() => import("./clues-down"))
const LazyScheduleElements = lazy(() => import("./scheduled-elements"))
const LazyTopRightContent = lazy(() => import("./top-right-content"))

// Loading fallbacks
const LoadingSpinner = (): ReactNode => (
  <div className="animate-pulse">Loading...</div>
)

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

const LoadingClues = (): ReactNode => (
  <div className="animate-pulse space-y-2">
    <div className="h-4 w-3/4 rounded bg-gray-200"></div>
    <div className="h-4 w-1/2 rounded bg-gray-200"></div>
    <div className="h-4 w-5/6 rounded bg-gray-200"></div>
  </div>
)

const LoadingContent = (): ReactNode => (
  <div className="h-full animate-pulse rounded bg-gray-100">Loading...</div>
)

const createLazyComponent = (
  LazyComponent: React.LazyExoticComponent<any>,
  fallback: ReactNode,
  props: any = {}
) => (
  <PanelErrorBoundary
    fallback={
      <div className="flex items-center justify-center h-full text-red-500">
        Failed to load component
      </div>
    }
  >
    <Suspense fallback={fallback}>
      <LazyComponent {...props} />
    </Suspense>
  </PanelErrorBoundary>
)

// Main content factory functions
const createEndingCredits = (): ReactNode =>
  createLazyComponent(LazyEndingCredits, <LoadingCredits />)

const createBrickChartCarousel = (): ReactNode =>
  createLazyComponent(LazyBrickChartCarousel, <LoadingChart />)

const createCrosswordPuzzle = (): ReactNode =>
  createLazyComponent(LazyCrosswordPuzzle, <LoadingPuzzle />)

// Content configuration with factory functions
const mainContentFactories: Record<string, Array<() => ReactNode>> = {
  credits: [createEndingCredits],
  "nfl-tennis": [createBrickChartCarousel],
  crossword: [createCrosswordPuzzle],
}

export function getMainContent(key: string): ReactNode {
  const factories = mainContentFactories[key] ?? []
  if (factories.length <= 0) return <Fragment />

  // Get random factory and execute it to create the lazy component
  const randomFactory = getRandomSubarray(factories, 1)[0]
  return randomFactory()
}

const createSchedulePanel = (): PanelContent => ({
  size: 65,
  node: createLazyComponent(LazyScheduleElements, <LoadingClues />),
})

const createTopRightContent = (): PanelContent => ({
  size: 35,
  node: createLazyComponent(LazyTopRightContent, <LoadingContent />),
})

export function gettopRightContent(): PanelContent {
  return createTopRightContent()
}

export function getbotLeftContent(): PanelContent {
  return createSchedulePanel()
}

import type { ReactNode } from "react"
import { Fragment, lazy, Suspense } from "react"
import { accordionData } from "@content/data/gemini-stepper"
import type { PanelContent } from "@content/types/panels"
import { getRandomSubarray } from "some-ui-utils"

// Lazy load all heavy components
const LazyEndingCredits = lazy(() => import("./ending-credits"))
const LazyBrickChartCarousel = lazy(() => import("./brick-chart-carousel"))
const LazyCrosswordPuzzle = lazy(() => import("./crossword-puzzle"))
const LazyCluesAcross = lazy(() => import("./clues-across"))
const LazyCluesDown = lazy(() => import("./clues-down"))
const LazyTopRightContent = lazy(() => import("./top-right-content"))
const LazyGeminiStepper = lazy(() => import("./gemini-stepper-with-prompt"))

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

// Panel content factories
const createCluesAcross = (): PanelContent => ({
  size: 50,
  node: createLazyComponent(LazyCluesAcross, <LoadingClues />),
})

const createCluesDown = (): PanelContent => ({
  size: 50,
  node: createLazyComponent(LazyCluesDown, <LoadingClues />),
})

const createTopRightContent = (): PanelContent => ({
  size: 40,
  node: createLazyComponent(LazyTopRightContent, <LoadingContent />),
})

const createGeminiStepperWithPrompt = (): PanelContent => ({
  size: 60,
  node: createLazyComponent(LazyGeminiStepper, <LoadingSpinner />, {
    steps: accordionData,
    autoplay: true,
  }),
})

// Panel content configuration with factory functions
const topLeftContentFactories: Record<string, Array<() => PanelContent>> = {
  crossword: [createCluesAcross],
}

export function gettopLeftContent(key: string): PanelContent {
  const factories = topLeftContentFactories[key] ?? []
  if (factories.length <= 0) return createTopRightContent()

  const randomFactory = getRandomSubarray(factories, 1)[0]
  return randomFactory()
}

const botLeftContentFactories: Record<string, Array<() => PanelContent>> = {
  crossword: [createCluesDown],
}

export function getbotLeftContent(key: string): PanelContent {
  const factories = botLeftContentFactories[key] ?? []
  if (factories.length <= 0) return createGeminiStepperWithPrompt()

  const randomFactory = getRandomSubarray(factories, 1)[0]
  return randomFactory()
}

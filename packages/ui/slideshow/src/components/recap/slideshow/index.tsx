import type { FC, ReactNode } from "react"
import { CodeSnippet } from "@slideshow/components/recap/code-snippet"
import { SlideNavigation } from "@slideshow/components/recap/slide-navigation"
import { SlideshowSlide } from "@slideshow/components/recap/slideshow-slide"
import { StatusCard } from "@slideshow/components/recap/status-card"
import { useCurrentTime } from "@slideshow/hooks/recap/use-current-time"
import {
  FloatingElementsPresets,
  useFloatingElements,
} from "@slideshow/hooks/recap/use-floating-elements"
import type { FloatingElementsConfig } from "@slideshow/hooks/recap/use-floating-elements"
import { useSlideshow } from "@slideshow/hooks/recap/use-slideshow"

export type SlideData = {
  id: string
  title: string
  terminalTitle: string
  content: ReactNode
}

export type Status = {
  id: string
  icon: string
  title: string
  description: string
  tags: Array<{ text: string; variant: "tech" | "status" | "default" }>
  status: "completed" | "current" | "planned"
}

type SlideshowProps = {
  slides: Array<SlideData>
  StatusCards?: Array<Status>
  sessionNumber?: number
  /** Configuration for floating background elements */
  floatingElements?:
    | FloatingElementsConfig
    | keyof typeof FloatingElementsPresets
}

export const Slideshow: FC<SlideshowProps> = ({
  slides,
  sessionNumber = 47,
  floatingElements = "codeSnippets",
}) => {
  const { currentSlide, goToSlide, progressKey } = useSlideshow({
    totalSlides: slides.length,
  })
  const currentTime = useCurrentTime()

  // Use the flexible floating elements hook
  const floatingConfig =
    typeof floatingElements === "string"
      ? FloatingElementsPresets[floatingElements]
      : floatingElements

  useFloatingElements(floatingConfig)

  return (
    <div className="ui-recap absolute relative inset-0 overflow-hidden bg-gradient-to-br from-gray-900 via-slate-800 to-blue-900 text-gray-200">
      {/* Floating elements container */}
      <div
        id="floating-elements"
        className="pointer-events-none fixed inset-0 -z-10"
      />

      {/* Session counter */}
      <div className="absolute right-8 top-8 rounded-md border border-gray-600 bg-gray-900/80 px-4 py-2.5 font-mono text-sm text-gray-400">
        <span>SESSION #{sessionNumber}</span> • <span>{currentTime}</span>
      </div>

      {/* Main slideshow container */}
      <div className="flex min-h-screen items-center justify-center p-4">
        {slides.map((slide, index) => (
          <SlideshowSlide
            key={slide.id}
            isActive={index === currentSlide}
            terminalTitle={slide.terminalTitle}
          >
            {slide.content}
          </SlideshowSlide>
        ))}
      </div>

      {/* Navigation */}
      <SlideNavigation
        totalSlides={slides.length}
        currentSlide={currentSlide}
        onSlideChange={goToSlide}
        progressKey={progressKey}
      />
    </div>
  )
}

// Helper function to create status card slides
export const createStatusCardSlide = (
  id: string,
  title: string,
  terminalTitle: string,
  StatusCards: Array<Status>,
  status: "completed" | "current" | "planned",
  additionalContent?: ReactNode
): SlideData => ({
  id,
  title,
  terminalTitle,
  content: (
    <>
      <h2 className="mb-8 text-4xl font-semibold text-white">{title}</h2>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {StatusCards
          .filter((card) => card.status === status)
          .map((card) => (
            <StatusCard key={card.id} card={card} />
          ))}
      </div>
      {additionalContent}
    </>
  ),
})

// Helper function to create code snippet slides
export const createCodeSlide = (
  id: string,
  title: string,
  terminalTitle: string,
  subtitle: string,
  codeContent: string,
  language: string = "javascript",
  additionalContent?: ReactNode
): SlideData => ({
  id,
  title,
  terminalTitle,
  content: (
    <>
      <h1 className="mb-8 bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-5xl font-bold text-transparent">
        {title}
      </h1>
      <p className="mb-8 text-xl text-gray-400">{subtitle}</p>
      <CodeSnippet language={language}>{codeContent}</CodeSnippet>
      {additionalContent}
    </>
  ),
})

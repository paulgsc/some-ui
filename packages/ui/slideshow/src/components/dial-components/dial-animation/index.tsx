import { useState } from "react"

import { DialControls } from "./components/DialControls"
import { DialProgress } from "./components/DialProgress"
import { DialSVG } from "./components/DialSVG"
import { useAudioFeedback } from "./hooks/useAudioFeedback"
import type { AnimationPattern } from "./hooks/useDialAnimation"
import { useDialAnimation } from "./hooks/useDialAnimation"
import { useDialDrag } from "./hooks/useDialDrag"
import type { DialSection } from "./hooks/useSectionCalculations"
import { useSectionCalculations } from "./hooks/useSectionCalculations"

type DialUIProps = {
  sections: Array<DialSection>
  cycleTime?: number // Total time for a complete cycle in ms
  uniformSections?: boolean // Whether sections should be uniform in size
}

export const DialUI = ({
  sections,
  cycleTime = 10000,
  uniformSections = true,
}: DialUIProps) => {
  const [isHovering, setIsHovering] = useState(false)
  const [animationPattern, setAnimationPattern] =
    useState<AnimationPattern>("linear")
  const [zoomedSection, setZoomedSection] = useState<number | null>(null)
  const [currentSectionState, setCurrentSectionState] = useState<DialSection>(
    sections[0]
  )

  // Use custom hooks
  const { isDragging, svgRef, handlePointerMouseDown } = useDialDrag({
    setCurrentAngle: (angle) => animation.setCurrentAngle(angle),
    getCurrentSection: (angle) => sectionCalc.getCurrentSection(angle),
    setCurrentSection: setCurrentSectionState,
  })

  const animation = useDialAnimation({
    sections,
    cycleTime,
    animationPattern,
    isDragging,
    isHovering,
  })

  const sectionCalc = useSectionCalculations({
    sections,
    uniformSections,
    currentAngle: animation.currentAngle,
  })

  const audio = useAudioFeedback({
    sections,
    currentSection: sectionCalc.currentSection,
  })

  return (
    <div className="flex flex-col items-center space-y-8">
      <div
        className="relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <DialSVG
          sections={sections}
          sectionBoundaries={sectionCalc.sectionBoundaries}
          currentAngle={animation.currentAngle}
          currentSection={sectionCalc.currentSection}
          svgRef={svgRef}
          isDragging={isDragging}
          isHovering={isHovering}
          handlePointerMouseDown={handlePointerMouseDown}
          setZoomedSection={setZoomedSection}
          zoomedSection={zoomedSection}
        />

        {/* Hidden audio element for sound effects */}
        <audio ref={audio.audioRef} />
      </div>

      {/* Progress bar */}
      <DialProgress
        progress={animation.progress}
        currentSection={sectionCalc.currentSection}
      />

      {/* Controls */}
      <DialControls
        animationPattern={animationPattern}
        setAnimationPattern={setAnimationPattern}
        volume={audio.volume}
        setVolume={audio.setVolume}
        isMuted={audio.isMuted}
        setIsMuted={audio.setIsMuted}
      />
    </div>
  )
}

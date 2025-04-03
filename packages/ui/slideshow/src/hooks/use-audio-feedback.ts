import { useEffect, useRef, useState } from "react"

import type { DialSection } from "@slideshow/types/dial"

type UseAudioFeedbackProps = {
  sections: Array<DialSection>
  currentSection: DialSection
}

export function useAudioFeedback({
  sections,
  currentSection,
}: UseAudioFeedbackProps) {
  const [previousSection, setPreviousSection] = useState<DialSection | null>(
    null
  )
  const [volume, setVolume] = useState(0.5)
  const [isMuted, setIsMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Play sound effect when transitioning between sections
  useEffect(() => {
    if (
      previousSection &&
      currentSection.id !== previousSection.id &&
      audioRef.current
    ) {
      // Different sound pitch based on section
      const baseFrequency = 300
      const sectionIndex = sections.findIndex((s) => s.id === currentSection.id)
      const frequency = baseFrequency + sectionIndex * 100

      // Create audio context
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContext()

      // Create oscillator
      const oscillator = audioContext.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)

      // Create gain node for volume control
      const gainNode = audioContext.createGain()
      gainNode.gain.value = isMuted ? 0 : volume

      // Connect nodes
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Play sound
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.1)
    }

    setPreviousSection(currentSection)
  }, [currentSection, previousSection, sections, volume, isMuted])

  return {
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    audioRef,
  }
}

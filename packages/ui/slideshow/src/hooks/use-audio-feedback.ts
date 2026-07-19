import type { Dispatch, RefObject, SetStateAction } from "react"
import { useEffect, useRef, useState } from "react"
import type { DialSection } from "@slideshow/types/dial"

type UseAudioFeedbackProps = {
  sections: Array<DialSection>
  currentSection: DialSection
}

export function useAudioFeedback({
  sections,
  currentSection,
}: UseAudioFeedbackProps): {
  volume: number
  setVolume: Dispatch<SetStateAction<number>>
  isMuted: boolean
  setIsMuted: Dispatch<SetStateAction<boolean>>
  audioRef: RefObject<HTMLAudioElement | null>
} {
  const [volume, setVolume] = useState(0.5)
  const [isMuted, setIsMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Use a ref to track the previous section to avoid setState inside the effect
  const previousSectionRef = useRef<DialSection | null>(null)

  // Play sound effect when transitioning between sections
  useEffect(() => {
    const prev = previousSectionRef.current

    if (prev && currentSection.id !== prev.id && audioRef.current) {
      const baseFrequency = 300
      const sectionIndex = sections.findIndex((s) => s.id === currentSection.id)
      const frequency = baseFrequency + sectionIndex * 100

      // Modern browsers universally support the unprefixed AudioContext
      const AudioContextClass = window.AudioContext

      const audioContext = new AudioContextClass()

      const oscillator = audioContext.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)

      const gainNode = audioContext.createGain()
      gainNode.gain.value = isMuted ? 0 : volume

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.1)
    }

    // Update the ref for the next render cycle
    previousSectionRef.current = currentSection
  }, [currentSection, sections, volume, isMuted])

  return {
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    audioRef,
  }
}

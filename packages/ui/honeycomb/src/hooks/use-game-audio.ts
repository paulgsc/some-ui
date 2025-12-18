import { useCallback, useEffect, useRef } from "react"
import type { AudioEvents } from "@honeycomb/lib/hangul/wasm-game-bridge"

export type AudioEvent =
  | "match_correct"
  | "match_perfect" // High quality match
  | "match_miss" // Wrong key pressed
  | "character_expire" // Character timed out
  | "streak_milestone" // Every 5 or 10 streak
  | "character_spawn" // New character appears
  | "difficulty_increase" // Speed increased
  | "game_complete" // Game completion
  | "game_timeout" // Game over - timeout

type UseGameAudioProps = {
  enabled?: boolean
  volume?: number // 0.0 to 1.0
}

export const useGameAudio = ({
  enabled = true,
  volume = 0.5,
}: UseGameAudioProps = {}) => {
  const audioContextRef = useRef<Map<AudioEvent, HTMLAudioElement>>(new Map())
  const isInitializedRef = useRef(false)

  // Initialize audio files
  useEffect(() => {
    if (isInitializedRef.current) return

    const audioFiles: Record<AudioEvent, string> = {
      match_correct: "/sfx/minimal-pop.mp3",
      match_perfect: "/sfx/subtle-spark.mp3",
      match_miss: "/sfx/error.mp3",
      character_expire: "/sfx/minimal-pop.mp3",
      streak_milestone: "/sfx/level-up.mp3",
      character_spawn: "/sfx/minimal-pop.mp3",
      difficulty_increase: "/sfx/minimal-pop.mp3",
      game_complete: "/sfx/minimal-pop.mp3",
      game_timeout: "/sfx/minimal-pop.mp3",
    }

    const audioMap = new Map<AudioEvent, HTMLAudioElement>()

    // Preload all audio files
    Object.entries(audioFiles).forEach(([event, path]) => {
      const audio = new Audio(path)
      audio.volume = volume
      audio.preload = "auto"
      audioMap.set(event as AudioEvent, audio)
    })

    audioContextRef.current = audioMap
    isInitializedRef.current = true

    return () => {
      // Cleanup on unmount
      audioMap.forEach((audio) => {
        audio.pause()
        audio.src = ""
      })
      audioMap.clear()
    }
  }, [volume])

  // Update volume when prop changes
  useEffect(() => {
    audioContextRef.current.forEach((audio) => {
      audio.volume = volume
    })
  }, [volume])

  const playSound = useCallback(
    (event: AudioEvent) => {
      if (!enabled) return

      const audio = audioContextRef.current.get(event)
      if (!audio) return

      // Clone and play to allow overlapping sounds
      const clone = audio.cloneNode() as HTMLAudioElement
      clone.volume = volume
      clone.play().catch((err) => {
        console.warn(`Failed to play audio: ${event}`, err)
      })
    },
    [enabled, volume]
  )

  return { playSound }
}

// Helper to process audio events from Rust
export const processAudioEvents = (
  events: AudioEvents,
  playSound: (event: AudioEvent) => void
) => {
  if (events.matchPerfect) {
    playSound("match_perfect")
  } else if (events.matchCorrect) {
    playSound("match_correct")
  }

  if (events.matchMiss) {
    playSound("match_miss")
  }

  if (events.characterExpired) {
    playSound("character_expire")
  }

  if (events.streakMilestone) {
    playSound("streak_milestone")
  }

  if (events.difficultyChanged && events.matchPerfect) {
    // Only play difficulty sound on successful matches, not on misses
    playSound("difficulty_increase")
  }
}

// Hook to integrate with game events
type UseGameAudioEventsProps = {
  enabled?: boolean
  volume?: number
  onSpawn?: boolean
}

export const useGameAudioEvents = ({
  enabled = true,
  volume = 0.5,
  onSpawn = false,
}: UseGameAudioEventsProps) => {
  const { playSound } = useGameAudio({ enabled, volume })

  // Play spawn sound when requested
  useEffect(() => {
    if (onSpawn) {
      playSound("character_spawn")
    }
  }, [onSpawn, playSound])

  return {
    playSound,
    processAudioEvents: (events: AudioEvents) =>
      processAudioEvents(events, playSound),
  }
}

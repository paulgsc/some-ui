import { useCallback, useEffect, useMemo } from "react"

const AUDIO_EVENTS = [
  "match_correct",
  "match_perfect",
  "match_miss",
  "character_expire",
  "streak_milestone",
  "character_spawn",
  "difficulty_increase",
  "game_complete",
  "game_timeout",
  "buffer_stale",
  "board_full",
] as const

export type AudioEvent = (typeof AUDIO_EVENTS)[number]

type UseGameAudioProps = {
  enabled?: boolean
  volume?: number
}

type UseGameAudioReturn = {
  playSound: (event: AudioEvent) => void
  unlockAudio: () => void
}

const AUDIO_FILES: Record<AudioEvent, string> = {
  match_correct: "/sfx/correct.mp3",
  match_perfect: "/sfx/correct.mp3",
  match_miss: "/sfx/miss.mp3",
  character_expire: "/sfx/expire.mp3",
  streak_milestone: "/sfx/correct.mp3",
  character_spawn: "/sfx/spawn.mp3",
  difficulty_increase: "/sfx/correct.mp3",
  game_complete: "/sfx/correct.mp3",
  game_timeout: "/sfx/timeout.mp3",
  buffer_stale: "/sfx/correct.mp3",
  board_full: "/sfx/correct.mp3",
}

export const useGameAudio = ({
  enabled = true,
  volume = 0.5,
}: UseGameAudioProps = {}): UseGameAudioReturn => {
  const audioMap = useMemo(() => {
    const map = new Map<AudioEvent, HTMLAudioElement>()

    // Looping over a strongly typed tuple means 'event' is inherently an AudioEvent
    AUDIO_EVENTS.forEach((event) => {
      const audio = new Audio(AUDIO_FILES[event])
      audio.preload = "auto"
      audio.volume = volume
      map.set(event, audio)
    })

    return map
  }, [volume])

  const unlockAudio = useCallback(() => {
    audioMap.forEach((audio) => {
      const wasMuted = audio.muted
      audio.muted = true

      audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.muted = wasMuted
        })
        .catch(() => {})
    })
  }, [audioMap])

  useEffect(() => {
    return (): void => {
      audioMap.forEach((audio) => {
        audio.pause()
        audio.src = ""
      })
      audioMap.clear()
    }
  }, [audioMap])

  useEffect(() => {
    audioMap.forEach((audio) => {
      audio.volume = volume
    })
  }, [audioMap, volume])

  const playSound = useCallback(
    (event: AudioEvent) => {
      if (!enabled) return

      const audio = audioMap.get(event)
      if (!audio) {
        // eslint-disable-next-line no-console
        console.log("no audio found for event: ", event)
        return
      }

      audio.currentTime = 0
      audio.volume = volume

      audio.play().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`Playback blocked for ${event}:`, err)
      })
    },
    [audioMap, enabled, volume]
  )

  return { playSound, unlockAudio }
}

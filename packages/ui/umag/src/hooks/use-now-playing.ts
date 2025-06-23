import { useMemo } from "react"

import { getFallbackImageUrl, shouldTextScroll } from "@umag/utils/now-playing"

interface UseNowPlayingProps {
  title: string
  artist: string
  albumArtUrl: string
  subtitle?: string
}

interface ProcessedData {
  title: string
  artist: string
  albumArtUrl: string
  subtitle?: string
}

interface ScrollState {
  title: boolean
  artist: boolean
  subtitle: boolean
}

export function useNowPlaying({
  title,
  artist,
  albumArtUrl,
  subtitle,
}: UseNowPlayingProps) {
  const processedData: ProcessedData = useMemo(
    () => ({
      title: title || "Unknown Track",
      artist: artist || "Unknown Artist",
      albumArtUrl: albumArtUrl || getFallbackImageUrl(),
      subtitle: subtitle,
    }),
    [title, artist, albumArtUrl, subtitle]
  )

  const shouldScroll: ScrollState = useMemo(
    () => ({
      title: shouldTextScroll(processedData.title, 25),
      artist: shouldTextScroll(processedData.artist, 30),
      subtitle: shouldTextScroll(processedData.subtitle || "", 35),
    }),
    [processedData.title, processedData.artist, processedData.subtitle]
  )

  return {
    processedData,
    shouldScroll,
  }
}

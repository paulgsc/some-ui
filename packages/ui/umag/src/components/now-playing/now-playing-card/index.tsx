import { useRef } from "react"
import type { FC } from "react"
import { BackgroundGlow } from "@umag/components/now-playing/background-glow"
import { SongInfo } from "@umag/components/now-playing/song-info"
import { StreamingNotes } from "@umag/components/now-playing/streaming-notes"
import { VinylRecord } from "@umag/components/now-playing/vinyl-record"
import { useNowPlayingWebSocket } from "@umag/hooks/use-now-playing-socket"
import { cn } from "some-ui-utils"

type NowPlayingProps = {
  className?: string
}

export const NowPlayingCard: FC<NowPlayingProps> = ({ className }) => {
  const {
    status: { title, channel, thumbnail },
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  } = useNowPlayingWebSocket()

  // Refs for each component
  const containerRef = useRef<HTMLDivElement>(null)
  const backgroundRef = useRef<HTMLDivElement>(null)
  const streamingNotesRef = useRef<HTMLDivElement>(null)
  const vinylRecordRef = useRef<HTMLDivElement>(null)
  const songInfoRef = useRef<HTMLDivElement>(null)

  if (error) {
    return <div> welp...</div>
  }

  if (isConnecting) {
    return <div> loading...</div>
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        className,
        "relative overflow-hidden rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"
      )}
    >
      {/* Background glow effect */}
      <BackgroundGlow ref={backgroundRef} />

      {/* Streaming musical notes from disc */}
      <StreamingNotes ref={streamingNotesRef} />

      <div className="relative z-10 flex h-full items-center gap-6">
        {/* Vinyl Record Section */}
        <VinylRecord ref={vinylRecordRef} thumbnail={thumbnail} title={title} />

        {/* Song Info Section */}
        <SongInfo ref={songInfoRef} title={title} channel={channel} />
      </div>
    </div>
  )
}

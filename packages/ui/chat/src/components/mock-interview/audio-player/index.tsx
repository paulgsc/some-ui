import { useRef, useState } from "react"
import { Pause, Play } from "lucide-react"

export const AudioPlayer = ({ url }: { url: string }): React.JSX.Element => {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = (): void => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      void audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-primary" />
        ) : (
          <Play className="w-5 h-5 text-primary ml-0.5" />
        )}
      </button>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">Recording preview</p>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user's own unscripted recording, no caption track exists */}
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  )
}

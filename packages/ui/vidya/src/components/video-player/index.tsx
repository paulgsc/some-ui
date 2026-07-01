import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

// ============================================================================
// TYPES
// ============================================================================

type VideoInsertProps = {
  src: string
  title?: string
  role?: "intro" | "interlude" | "segment"
  onComplete?: () => void
  showProgress?: boolean
  showControls?: "never" | "hover" | "always"
  entryStyle?: "fade" | "ceremonial"
}

type PlaybackPhase =
  | "mounting"
  | "entering"
  | "playing"
  | "exiting"
  | "complete"

// ============================================================================
// HOOKS
// ============================================================================

const useVideoInsertLifecycle = (
  onComplete?: () => void
): {
  phase: PlaybackPhase
  videoRef: React.RefObject<HTMLVideoElement | null>
  handlers: {
    handleEntryComplete: () => void
    handleVideoEnd: () => void
    handleExitComplete: () => void
  }
} => {
  const [phase, setPhase] = useState<PlaybackPhase>("mounting")
  const videoRef = useRef<HTMLVideoElement>(null)

  // Phase: mounting → entering → playing → exiting → complete
  useEffect(() => {
    if (phase === "mounting") {
      // Brief delay for render stabilization
      const timer = setTimeout(() => setPhase("entering"), 50)
      return (): void => clearTimeout(timer)
    }
  }, [phase])

  const handleEntryComplete = (): void => {
    setPhase("playing")
    // Ensure video plays after entry animation
    if (videoRef.current) {
      // eslint-disable-next-line no-console
      videoRef.current.play().catch(console.error)
    }
  }

  const handleVideoEnd = (): void => {
    setPhase("exiting")
  }

  const handleExitComplete = (): void => {
    setPhase("complete")
    onComplete()
  }

  return {
    phase,
    videoRef,
    handlers: {
      handleEntryComplete,
      handleVideoEnd,
      handleExitComplete,
    },
  }
}

const useVideoProgress = (
  videoRef: React.RefObject<HTMLVideoElement>
): { progress: number; duration: number } => {
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = (): void => {
      setDuration(video.duration)
    }

    const handleTimeUpdate = (): void => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100)
      }
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata)
    video.addEventListener("timeupdate", handleTimeUpdate)

    return (): void => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
      video.removeEventListener("timeupdate", handleTimeUpdate)
    }
  }, [videoRef])

  return { progress, duration }
}

// ============================================================================
// COMPONENTS
// ============================================================================

const VideoInsertLabel = ({
  role,
  phase,
}: {
  role?: string
  phase: PlaybackPhase
}): JSX.Element => {
  const shouldShow = phase === "entering" || phase === "playing"

  return (
    <AnimatePresence>
      {shouldShow && role && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 left-4 z-20"
        >
          <div className="px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-xs font-medium uppercase tracking-wider">
                {role}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const VideoInsertProgress = ({
  progress,
  show,
}: {
  progress: number
  show: boolean
}): JSX.Element | null => {
  if (!show) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-20">
      <motion.div
        className="h-full bg-white"
        style={{ width: `${progress}%` }}
        transition={{ duration: 0.1 }}
      />
    </div>
  )
}

const VideoInsertTitle = ({
  title,
  phase,
}: {
  title?: string
  phase: PlaybackPhase
}): JSX.Element => {
  const shouldShow = phase === "entering"

  return (
    <AnimatePresence>
      {shouldShow && title && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
        >
          <div className="px-6 py-3 bg-black/80 backdrop-blur-md rounded-lg border border-white/20">
            <h2 className="text-white text-2xl font-bold tracking-tight">
              {title}
            </h2>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VideoInsertOverlay = ({
  src,
  title,
  role = "segment",
  onComplete,
  showProgress = false,
  showControls = "never",
  entryStyle = "ceremonial",
}: VideoInsertProps): JSX.Element => {
  const { phase, videoRef, handlers } = useVideoInsertLifecycle(onComplete)
  const { progress } = useVideoProgress(videoRef)
  const [isHovered, setIsHovered] = useState(false)

  const shouldShowControls =
    showControls === "always" || (showControls === "hover" && isHovered)

  // Animation variants
  const containerVariants = {
    mounting: { opacity: 0 },
    entering:
      entryStyle === "ceremonial" ? { opacity: 1, scale: 1 } : { opacity: 1 },
    playing: { opacity: 1, scale: 1 },
    exiting: { opacity: 0, scale: 0.96 },
  }

  const entryTransition =
    entryStyle === "ceremonial"
      ? { duration: 0.5, ease: [0.16, 1, 0.3, 1], scale: { from: 0.96 } }
      : { duration: 0.2, ease: "easeOut" }

  return (
    <motion.div
      className="relative w-full h-full flex items-center justify-center bg-zinc-950"
      initial="mounting"
      animate={phase}
      variants={containerVariants}
      transition={phase === "entering" ? entryTransition : { duration: 0.3 }}
      onAnimationComplete={() => {
        if (phase === "entering") handlers.handleEntryComplete()
        if (phase === "exiting") handlers.handleExitComplete()
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Stable broadcast frame */}
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl">
        {/* Video element */}
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted={false}
          onEnded={handlers.handleVideoEnd}
        />

        {/* Vignette overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none" />

        {/* Insert label (corner badge) */}
        <VideoInsertLabel role={role} phase={phase} />

        {/* Title slate (appears briefly on entry) */}
        <VideoInsertTitle title={title} phase={phase} />

        {/* Progress indicator */}
        <VideoInsertProgress progress={progress} show={showProgress} />

        {/* Optional controls (minimal, broadcast-style) */}
        <AnimatePresence>
          {shouldShowControls && phase === "playing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 left-4 right-4 flex items-center gap-3"
            >
              <button
                onClick={() => {
                  if (videoRef.current?.paused) {
                    videoRef.current.play()
                  } else {
                    videoRef.current?.pause()
                  }
                }}
                className="px-3 py-2 bg-black/60 backdrop-blur-sm rounded-md border border-white/10 text-white text-sm hover:bg-black/80 transition-colors"
              >
                {videoRef.current?.paused ? "▶" : "⏸"}
              </button>
              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ============================================================================
// DEMO
// ============================================================================

export const App = (): JSX.Element => {
  const [currentVideo, setCurrentVideo] = useState(0)
  const [showVideo, setShowVideo] = useState(true)

  const videos = [
    {
      src: "https://stream.mux.com/DS00Spx1CV902MCtPj5WknGlR102V5HFkDe/high.mp4",
      title: "Introduction",
      role: "intro" as const,
    },
    {
      src: "https://stream.mux.com/DS00Spx1CV902MCtPj5WknGlR102V5HFkDe/high.mp4",
      title: "Interlude",
      role: "interlude" as const,
    },
  ]

  const handleComplete = (): void => {
    setShowVideo(false)
    // Simulate switching to different content
    setTimeout(() => {
      const nextIndex = (currentVideo + 1) % videos.length
      setCurrentVideo(nextIndex)
      setShowVideo(true)
    }, 1000)
  }

  return (
    <div className="w-full h-screen bg-zinc-900">
      <AnimatePresence mode="wait">
        {showVideo ? (
          <VideoInsertOverlay
            key={currentVideo}
            {...videos[currentVideo]}
            onComplete={handleComplete}
            showProgress={true}
            showControls="hover"
            entryStyle="ceremonial"
          />
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-white text-xl">
              Other content would appear here...
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

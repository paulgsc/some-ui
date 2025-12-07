import { useRef } from "react"
import type { FC } from "react"
import { BackgroundGlow } from "@umag/components/now-playing/background-glow"
import { SongInfo } from "@umag/components/now-playing/song-info"
import { StreamingNotes } from "@umag/components/now-playing/streaming-notes"
import { VinylRecord } from "@umag/components/now-playing/vinyl-record"
import { AlertCircle, Home, Loader2, RefreshCw } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "some-ui-shared"
import { cn, useNowPlayingWebSocket } from "some-ui-utils"

type NowPlayingProps = {
  className?: string
  showError?: boolean
}

export const NowPlayingCard: FC<NowPlayingProps> = ({
  className,
  showError = true,
}) => {
  const {
    status: { title, channel, thumbnail },
    isConnected,
    isInitializing,
    error,
  } = useNowPlayingWebSocket({
    url: `ws://${window.location.hostname}:3000/ws`,
    queryKey: ["now_playing"],
  })

  // Refs for each component
  const containerRef = useRef<HTMLDivElement>(null)
  const backgroundRef = useRef<HTMLDivElement>(null)
  const streamingNotesRef = useRef<HTMLDivElement>(null)
  const vinylRecordRef = useRef<HTMLDivElement>(null)
  const songInfoRef = useRef<HTMLDivElement>(null)

  if (error && showError) {
    return <ErrorBoundaryFallback error={error} />
  }

  if (isInitializing) {
    return <LoadingCard />
  }

  return (
    <>
      <div
        className={cn(
          "absolute m-auto aspect-square inset-0 rounded-xl",
          "bg-no-repeat bg-center bg-cover",
          "-z-10"
        )}
        style={{
          background: `
      linear-gradient(to bottom, rgb(30, 58, 138), rgb(15, 23, 42)),
      url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><circle cx="100" cy="50" r="2" fill="white" opacity="0.9"/><circle cx="600" cy="400" r="1.5" fill="white" opacity="0.7"/><circle cx="800" cy="700" r="2" fill="white" opacity="0.8"/><circle cx="200" cy="900" r="1" fill="white" opacity="0.6"/><circle cx="900" cy="100" r="1.5" fill="white" opacity="0.8"/><circle cx="300" cy="300" r="1" fill="white" opacity="0.5"/><circle cx="700" cy="200" r="1" fill="white" opacity="0.6"/><circle cx="400" cy="600" r="2" fill="white" opacity="0.9"/><circle cx="500" cy="800" r="1" fill="white" opacity="0.7"/></svg>')
        `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

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
          <VinylRecord
            ref={vinylRecordRef}
            thumbnail={thumbnail}
            title={title}
            onConnect={isConnected ? () => {} : () => {}}
          />

          {/* Song Info Section */}
          <SongInfo ref={songInfoRef} title={title} channel={channel} />
        </div>
      </div>
    </>
  )
}

export const LoadingCard = () => {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="text-primary size-10 animate-spin" />
          <div className="text-center">
            <h3 className="font-medium">Please wait</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              We're getting things ready for you
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const ErrorBoundaryFallback = ({
  error,
  resetError,
}: {
  error: string
  resetError?: () => void
}) => {
  return (
    <div className="flex size-fit items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
            <AlertCircle className="text-destructive size-8" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription>
            We're sorry, but something unexpected happened. Our team has been
            notified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="mt-4">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
              Technical details
            </summary>
            <pre className="bg-muted mt-2 overflow-auto rounded p-2 text-xs">
              {error}
            </pre>
          </details>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={resetError} className="flex-1">
            <RefreshCw className="mr-2 size-4" />
            Try Again
          </Button>
          <Button variant="outline" className="flex-1 bg-transparent">
            <Home className="mr-2 size-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

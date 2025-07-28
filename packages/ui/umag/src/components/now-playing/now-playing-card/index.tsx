import { useRef } from "react"
import type { FC } from "react"
import { BackgroundGlow } from "@umag/components/now-playing/background-glow"
import { SongInfo } from "@umag/components/now-playing/song-info"
import { StreamingNotes } from "@umag/components/now-playing/streaming-notes"
import { VinylRecord } from "@umag/components/now-playing/vinyl-record"
import { useNowPlayingWebSocket } from "@umag/hooks/use-now-playing-socket"
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
    return <ErrorBoundaryFallback error={error} />
  }

  if (isConnecting) {
    return <LoadingCard />
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
        <VinylRecord
          ref={vinylRecordRef}
          thumbnail={thumbnail}
          title={title}
          onConnect={isConnected ? disconnect : connect}
        />

        {/* Song Info Section */}
        <SongInfo ref={songInfoRef} title={title} channel={channel} />
      </div>
    </div>
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

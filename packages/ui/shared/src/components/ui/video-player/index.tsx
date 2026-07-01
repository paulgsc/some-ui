import type { ComponentProps, CSSProperties } from "react"
import { cn } from "@shared/lib/utils"
import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react"

export type VideoPlayerProps = ComponentProps<typeof MediaController>

const variables = {
  "--media-primary-color": "var(--primary)",
  "--media-secondary-color": "var(--background)",
  "--media-text-color": "var(--foreground)",
  "--media-background-color": "var(--background)",
  "--media-control-hover-background": "var(--accent)",
  "--media-font-family": "var(--font-sans)",
  "--media-live-button-icon-color": "var(--muted-foreground)",
  "--media-live-button-indicator-color": "var(--destructive)",
  "--media-range-track-background": "var(--border)",
} as CSSProperties

export const VideoPlayer = ({
  style,
  ...props
}: VideoPlayerProps): React.JSX.Element => (
  <MediaController
    style={{
      ...variables,
      ...style,
    }}
    {...props}
  />
)

export type VideoPlayerControlBarProps = ComponentProps<typeof MediaControlBar>

export const VideoPlayerControlBar = (
  props: VideoPlayerControlBarProps
): React.JSX.Element => <MediaControlBar {...props} />

export type VideoPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>

export const VideoPlayerTimeRange = ({
  className,
  ...props
}: VideoPlayerTimeRangeProps): React.JSX.Element => (
  <MediaTimeRange className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerTimeDisplayProps = ComponentProps<
  typeof MediaTimeDisplay
>

export const VideoPlayerTimeDisplay = ({
  className,
  ...props
}: VideoPlayerTimeDisplayProps): React.JSX.Element => (
  <MediaTimeDisplay className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerVolumeRangeProps = ComponentProps<
  typeof MediaVolumeRange
>

export const VideoPlayerVolumeRange = ({
  className,
  ...props
}: VideoPlayerVolumeRangeProps): React.JSX.Element => (
  <MediaVolumeRange className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>

export const VideoPlayerPlayButton = ({
  className,
  ...props
}: VideoPlayerPlayButtonProps): React.JSX.Element => (
  <MediaPlayButton className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerSeekBackwardButtonProps = ComponentProps<
  typeof MediaSeekBackwardButton
>

export const VideoPlayerSeekBackwardButton = ({
  className,
  ...props
}: VideoPlayerSeekBackwardButtonProps): React.JSX.Element => (
  <MediaSeekBackwardButton className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerSeekForwardButtonProps = ComponentProps<
  typeof MediaSeekForwardButton
>

export const VideoPlayerSeekForwardButton = ({
  className,
  ...props
}: VideoPlayerSeekForwardButtonProps): React.JSX.Element => (
  <MediaSeekForwardButton className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>

export const VideoPlayerMuteButton = ({
  className,
  ...props
}: VideoPlayerMuteButtonProps): React.JSX.Element => (
  <MediaMuteButton className={cn("p-2.5", className)} {...props} />
)

export type VideoPlayerContentProps = ComponentProps<"video">

export const VideoPlayerContent = ({
  className,
  ...props
}: VideoPlayerContentProps): React.JSX.Element => (
  <video className={cn("mt-0 mb-0", className)} {...props} />
)

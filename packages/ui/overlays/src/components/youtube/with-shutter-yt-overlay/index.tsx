import YoutubeOverlay from "@overlays/components/youtube/overlay"
import { LensShutter } from "some-ui-slideshow"

export const WithLensShutterYtOverlay = (): React.JSX.Element => {
  return (
    <LensShutter>
      <YoutubeOverlay />
    </LensShutter>
  )
}

import { Fragment } from "react"
import { SplayAnimation, YoutubeMarquee } from "@overlays/components"
import Logo from "@overlays/components/youtube/logo"
import { BoredAnimation } from "some-ui-emoji-animations"
import { NeonText } from "some-ui-neon-sign"
import { RotatingCube } from "some-ui-slideshow"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

const YoutubeOverlay = (): React.JSX.Element => {
  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: <RotatingCube />,
    [WireframeRegion.MARQUEE]: <NeonText />,
    [WireframeRegion.MAIN_CONTENT]: <Fragment />,
    [WireframeRegion.FOOTER_LEFT]: <Logo />,
    [WireframeRegion.SIDEBAR_TOP]: (
      <BoredAnimation className="absolute inset-0 size-full" />
    ),
    [WireframeRegion.SIDEBAR_BOTTOM]: <SplayAnimation />,
    [WireframeRegion.FOOTER_RIGHT]: <YoutubeMarquee />,
  }

  return <YoutubeWireframe content={overlayContent} />
}

export default YoutubeOverlay

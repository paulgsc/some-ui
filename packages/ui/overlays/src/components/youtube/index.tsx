import { Fragment } from "react"
import Logo from "@overlays/components/youtube/logo"
import { RotatingCube } from "some-ui-slideshow"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

const YoutubeOverlay = () => {
  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: <RotatingCube />,
    [WireframeRegion.MARQUEE]: <Fragment />,
    [WireframeRegion.MAIN_CONTENT]: <Fragment />,
    [WireframeRegion.FOOTER_LEFT]: <Logo />,
    [WireframeRegion.SIDEBAR_TOP]: <Fragment />,
    [WireframeRegion.SIDEBAR_BOTTOM]: <Fragment />,
    [WireframeRegion.FOOTER_RIGHT]: <Fragment />,
  }

  return <YoutubeWireframe content={overlayContent} />
}

export default YoutubeOverlay

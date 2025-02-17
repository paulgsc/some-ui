import { Fragment } from "react"
import { SplayAnimation, YoutubeMarquee } from "@overlays/components"
import Logo from "@overlays/components/youtube/logo"
import { BoredAnimation } from "some-ui-emoji-animations"
import { RotatingCube, RotatingNeonSign } from "some-ui-slideshow"
import type { WireframeContent } from "wireframes"
import { WireframeRegion, YoutubeWireframe } from "wireframes"

const YoutubeOverlay = (): React.JSX.Element => {
  const overlayContent: WireframeContent = {
    [WireframeRegion.VIDEO]: <RotatingCube />,
    [WireframeRegion.MARQUEE]: (
      <RotatingNeonSign
        className="size-11/12"
        faceClassName="bg-sky-200"
        perspective={1250}
        dof="X-axis"
        duration={30000}
      />
    ),
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

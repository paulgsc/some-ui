import type { YouTubeRegion } from "@some-ui/types"
import type { LayoutNode } from "@wireframes/lib"

export const voiceTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "row",
  splitId: "split-4",
  children: [
    {
      node: {
        type: "leaf",
        id: "video",
      },
      weight: 0.6708239910313901,
    },
    {
      node: {
        type: "split",
        axis: "col",
        splitId: "split-5",
        children: [
          {
            node: {
              type: "leaf",
              id: "title",
            },
            weight: 0.38709662159656594,
          },
          {
            node: {
              type: "leaf",
              id: "mainContent",
            },
            weight: 1.9849033432084693,
          },
          {
            node: {
              type: "leaf",
              id: "footerRight",
            },
            weight: 0.6280000351949647,
          },
        ],
      },
      weight: 1.6000205002706658,
    },
    {
      node: {
        type: "leaf",
        id: "sidebarBottom",
      },
      weight: 0.7291555086979442,
    },
  ],
}

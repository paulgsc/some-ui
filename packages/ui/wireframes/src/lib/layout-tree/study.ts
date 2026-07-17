import type { LayoutNode } from "@wireframes/lib"
import type { YouTubeRegion } from "some-types-utils"

export const studyTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "col",
  splitId: "split-0",
  children: [
    {
      node: {
        type: "leaf",
        id: "title",
      },
      weight: 0.17333333333333323,
    },
    {
      node: {
        type: "split",
        axis: "row",
        splitId: "split-1",
        children: [
          {
            node: {
              type: "leaf",
              id: "mainContent",
            },
            weight: 1.6146625766871165,
          },
          {
            node: {
              type: "split",
              axis: "col",
              splitId: "split-2",
              children: [
                {
                  node: {
                    type: "leaf",
                    id: "sidebarTop",
                  },
                  weight: 0.36496350364963503,
                },
                {
                  node: {
                    type: "leaf",
                    id: "sidebarBottom",
                  },
                  weight: 1.635036496350365,
                },
              ],
            },
            weight: 0.38533742331288345,
          },
        ],
      },
      weight: 1.8266666666666667,
    },
  ],
}

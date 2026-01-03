import type { YouTubeRegion } from "some-types-utils"
import type { LayoutNode } from "wireframes"

export const topikTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "row",
  splitId: "split-0",
  children: [
    {
      node: {
        type: "leaf",
        id: "mainContent",
      },
      weight: 1.6962023460410558,
    },
    {
      node: {
        type: "split",
        axis: "col",
        splitId: "split-1",
        children: [
          {
            node: {
              type: "leaf",
              id: "sidebarTop",
            },
            weight: 0.36,
          },
          {
            node: {
              type: "leaf",
              id: "sidebarBottom",
            },
            weight: 1.6400000000000001,
          },
        ],
      },
      weight: 0.3037976539589443,
    },
  ],
}

import type { YouTubeRegion } from "some-types-utils"
import type { LayoutNode } from "wireframes"

export const dramaTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "row",
  splitId: "split-1",
  children: [
    {
      node: {
        type: "leaf",
        id: "video",
      },
      weight: 0.8252347716433808,
    },
    {
      node: {
        type: "split",
        axis: "col",
        splitId: "split-6",
        children: [
          {
            node: {
              type: "leaf",
              id: "title",
            },
            weight: 0.48724655268231554,
          },
          {
            node: {
              type: "leaf",
              id: "mainContent",
            },
            weight: 1.9782596410560531,
          },
          {
            node: {
              type: "leaf",
              id: "footerLeft",
            },
            weight: 0.5344938062616313,
          },
        ],
      },
      weight: 1.815452207040586,
    },
    {
      node: {
        type: "split",
        axis: "col",
        splitId: "split-8",
        children: [
          {
            node: {
              type: "leaf",
              id: "sidebarTop",
            },
            weight: 1,
          },
          {
            node: {
              type: "leaf",
              id: "sidebarBottom",
            },
            weight: 1,
          },
        ],
      },
      weight: 0.7080630213160334,
    },
  ],
}

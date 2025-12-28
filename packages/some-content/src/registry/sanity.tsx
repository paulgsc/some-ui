import type { FC } from "react"

const SanityPanel: FC = () => {
  return <div className="bg-sky-200">SANITY PANEL</div>
}

SanityPanel.displayName = "SanityPanel"

export const sanityEntry = {
  Component: SanityPanel,
  preload: async () => ({ default: SanityPanel }),
}

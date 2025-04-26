import type { ReactNode } from "react"

type NeonContainerProps = {
  children: ReactNode
  glowIntensity?: number
  className?: string
}

export const NeonCard = ({
  children,
  className = "",
}: NeonContainerProps): React.JSX.Element => {
  return (
    <div
      className={`
      animate-pulse-slow [box-shadow:0_0_ size-full rounded-lg border-4 border-[oklch(50%_0.3_320deg)] px-8
        py-4
        ${className}
        `}
    >
      {children}
    </div>
  )
}

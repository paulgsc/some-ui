import type { FC } from "react"
import { Fragment } from "react"
import type { AllowedRotationAxis } from "@some-ui/dice-card"
import { DiceCard } from "@some-ui/dice-card"
import { NowPlayingCard } from "@some-ui/umag"
import { NeonText } from "some-ui-neon-sign"

type RotatingNeonSignProps = {
  perspective?: number
  dof?: AllowedRotationAxis
  className?: string
  faceClassName?: string
  duration?: number
}

export const RotatingNeonSign: FC<RotatingNeonSignProps> = ({
  perspective = 1200,
  duration = 10000,
  dof = "Y-axis",
  className,
  faceClassName,
}): React.JSX.Element => {
  return (
    <DiceCard
      className={className}
      faceClassName={faceClassName}
      dof={dof}
      faces={cubeFaces()}
      perspective={perspective}
      duration={duration}
    />
  )
}

const sections = [
  {
    className: "absolute inset-0 size-full",
  },
  {
    className: "  size-full",
  },
  {
    className: "  size-full",
  },
  {
    className: "  size-full",
  },
  {
    className: "  size-full",
  },
  {
    className: "  size-full",
  },
] as const

const cubeFaces = (): Array<React.JSX.Element> =>
  sections.map((section, index) => {
    return (
      <Fragment key={index}>
        {index === -1 ? (
          <NowPlayingCard className={section.className} showError={false} />
        ) : (
          <NeonText
            storageKey={`neon_${index}`}
            initialText={"change me..."}
            className={section.className}
          />
        )}
      </Fragment>
    )
  })

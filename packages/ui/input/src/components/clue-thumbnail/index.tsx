import type { FC } from "react"
import { cn } from "some-ui-utils"

type ClueThumbnailProps = {
  src: string
  alt: string
  mixLabel?: string
  isActive?: boolean
}

export const ClueThumbnail: FC<ClueThumbnailProps> = ({
  src,
  alt,
  isActive = false,
}) => {
  return (
    <div
      className={cn(
        "relative flex-shrink-0 transition-transform duration-300",
        {
          "animate-rubber-band": isActive,
        }
      )}
    >
      <div className="relative size-20 overflow-hidden rounded-lg">
        <img
          src={src}
          alt={alt}
          className={cn(
            "aspect-square object-cover transition-all duration-300",
            {
              "brightness-110": isActive,
            }
          )}
          sizes="168px"
        />
      </div>
    </div>
  )
}

import type { JSX } from "react"
import { useId } from "react"
import { cn } from "some-ui-utils"

export const YTGridThumbnail = (): JSX.Element => {
  // useId generates a unique, stable string (e.g., ":r0:") safely during render
  const id = useId()
  const src = `https://picsum.photos/800/600?random=${id}`
  const alt = "Random pic"

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "size-full rounded-full bg-rose-200 object-cover brightness-90"
      )}
    />
  )
}

import { cn } from "some-ui-utils"

export const YTGridThumbnail = (): React.JSX.Element => {
  const src = `https://picsum.photos/800/600?random=${Math.random()}`
  const alt = "Random pic"
  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "size-full rounded-full bg-rose-200 bg-cover brightness-90"
      )}
    />
  )
}

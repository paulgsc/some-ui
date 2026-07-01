import { logo } from "@overlays/components/youtube/assets"

const Logo = (): React.JSX.Element => {
  return (
    <img
      src={logo}
      alt="PGDEV"
      className="aspect-square size-full rounded-md object-scale-down"
    />
  )
}

export default Logo

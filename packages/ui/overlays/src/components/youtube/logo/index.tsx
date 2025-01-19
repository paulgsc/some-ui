import { logo } from "@overlays/components/youtube/assets"

const Logo = () => {
  return (
    <img
      src={logo}
      alt="PGDEV"
      className="absolute inset-0 aspect-square size-full rounded-md object-scale-down"
    />
  )
}

export default Logo

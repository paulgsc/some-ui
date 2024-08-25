import type { FC, PropsWithChildren } from "react"

type BannerProps = {
  link?: string
  type?: "default" | "warning" | "error"
}

const Banner: FC<PropsWithChildren<BannerProps>> = ({ link, children }) => (
  <div className="">{link ? <a href={link}>{children}</a> : children}</div>
)

export default Banner

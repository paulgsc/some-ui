import { MdxProps } from "@mdx/types"
import { useMDXComponent } from "next-contentlayer2/hooks"

import { useConfig } from "@/hooks/use-config"

const Mdx = ({ code, component = {} }: MdxProps) => {
  const config = useConfig()
  const Component = useMDXComponent(code, {
    style: config.style,
  })

  const mergedComponents = {
    ...defaultComponents,
    ...components,
  }

  return (
    <div className="mdx">
      <MDXComponent components={mergedComponents} />
    </div>
  )
}

export default Mdx

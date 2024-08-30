import type { MdxProps } from "@mdx/types"
import { useMDXComponent } from "next-contentlayer2/hooks"

import { defaultMdxComponents } from "./default-components"

const Mdx = ({ code, components = {} }: MdxProps): JSX.Element => {
  const Component = useMDXComponent(code)

  const mergedComponents = {
    ...defaultMdxComponents,
    ...components,
  }

  return (
    <div className="mdx">
      <Component components={mergedComponents} />
    </div>
  )
}

export default Mdx

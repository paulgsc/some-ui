import type { CSSProperties, FC } from "react"

import type { Node, Rect } from "./rect-utils"

type RectDemoProps = {
  rect: Rect
  nodes?: Array<Node>
}

const RectDemo: FC<RectDemoProps> = ({ rect, nodes = [] }) => {
  const style: CSSProperties = {
    position: "relative",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: "1px solid black",
    margin: "10px",
  }

  return (
    <div style={style}>
      <div>{`Width: ${rect.width}, Height: ${rect.height}`}</div>
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            position: "absolute",
            left: `${node.position.x - rect.x}px`,
            top: `${node.position.y - rect.y}px`,
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "red",
          }}
        />
      ))}
    </div>
  )
}

export default RectDemo

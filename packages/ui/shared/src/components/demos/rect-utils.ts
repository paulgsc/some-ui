// Types
type Point = {
  x: number
  y: number
}

type Size = {
  width: number
  height: number
}

export type Rect = Point & Size

export type Node = {
  id: string
  position: Point
}

// Functions
export const createRect = (
  x: number,
  y: number,
  width: number,
  height: number
): Rect => ({
  x,
  y,
  width,
  height,
})

export const createRectFromPoints = (p1: Point, p2: Point): Rect => {
  const x = Math.min(p1.x, p2.x)
  const y = Math.min(p1.y, p2.y)
  const width = Math.abs(p2.x - p1.x)
  const height = Math.abs(p2.y - p1.y)
  return createRect(x, y, width, height)
}

export const createRectFromNodes = (nodes: Array<Node>): Rect => {
  if (nodes.length === 0) {
    return createRect(0, 0, 0, 0)
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  nodes.forEach((node) => {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x)
    maxY = Math.max(maxY, node.position.y)
  })

  return createRect(minX, minY, maxX - minX, maxY - minY)
}

export const isPointInRect = (point: Point, rect: Rect): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

const moveNode = (
  node: Node,
  dx: number,
  dy: number,
  boundingRect: Rect
): Node => {
  const newX = Math.max(
    boundingRect.x,
    Math.min(node.position.x + dx, boundingRect.x + boundingRect.width)
  )
  const newY = Math.max(
    boundingRect.y,
    Math.min(node.position.y + dy, boundingRect.y + boundingRect.height)
  )
  return { ...node, position: { x: newX, y: newY } }
}

export const cyclicMoveNodes = (
  nodes: Array<Node>,
  boundingRect: Rect
): Array<Node> => {
  const positions = nodes.map((node) => node.position)
  return nodes
    .map((node, index) => ({
      ...node,
      position: positions[(index + 1) % positions.length],
    }))
    .map((node) => moveNode(node, 0, 0, boundingRect)) // Ensure nodes stay within bounds
}

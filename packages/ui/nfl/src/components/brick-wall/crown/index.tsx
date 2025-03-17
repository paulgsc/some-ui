type CrownProps = {
  x: number
  y: number
  width: number
  height: number
}

export const Crown: React.FC<CrownProps> = ({ x, y, width, height }) => {
  return (
    <polygon
      points={`${x - width / 2},${y} ${x - width / 3},${y - height} ${x},${y - height / 2} ${x + width / 3},${y - height} ${x + width / 2},${y}`}
      fill="gold"
      stroke="#000"
      strokeWidth="1.5"
    />
  )
}

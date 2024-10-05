export type BarRectangleProps = {
  option: ActiveShape<BarProps, SVGPathElement>
  isActive: boolean
  onMouseEnter?: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => void
  onMouseLeave?: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => void
  onClick?: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => void
  width?: number
  height?: number
} & BarProps

export function BarRectangle(props: BarRectangleProps) {
  return (
    <Shape
      shapeType="rectangle"
      propTransformer={typeguardBarRectangleProps}
      activeClassName="recharts-active-bar"
      {...props}
    />
  )
}

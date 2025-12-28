// import { useEffect, useState } from "react"
//
// export const LadderNode = ({
//   id,
//   x,
//   y,
//   width,
//   height,
//   animated = false,
//   delay = 0,
// }) => {
//   const [opacity, setOpacity] = useState(animated ? 0 : 1)
//   const [scale, setScale] = useState(animated ? 0.5 : 1)
//
//   useEffect(() => {
//     if (animated) {
//       const timer = setTimeout(() => {
//         setOpacity(1)
//         setScale(1)
//       }, delay)
//       return () => clearTimeout(timer)
//     }
//   }, [animated, delay])
//
//   const transition =
//     "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
//
//   return (
//     <g
//       transform={`translate(${x - width / 2}, ${y - height / 2}) scale(${scale})`}
//       style={{
//         opacity,
//         transition,
//         transformOrigin: `${width / 2}px ${height / 2}px`,
//       }}
//     >
//       <rect
//         width={width}
//         height={height}
//         rx={5}
//         ry={5}
//         fill="#6050DC"
//         stroke="#000"
//         strokeWidth={1}
//       />
//       <text
//         x={width / 2}
//         y={height / 2}
//         textAnchor="middle"
//         dominantBaseline="middle"
//         fill="white"
//         fontSize={14}
//       >
//         {id}
//       </text>
//     </g>
//   )
// }

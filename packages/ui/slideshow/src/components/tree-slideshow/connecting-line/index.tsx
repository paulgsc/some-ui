// import { useEffect, useState } from "react"
//
// export const ConnectingLine = ({
//   startX,
//   startY,
//   endX,
//   endY,
//   animated = false,
//   delay = 0,
// }) => {
//   const [progress, setProgress] = useState(animated ? 0 : 1)
//
//   useEffect(() => {
//     if (animated) {
//       const timer = setTimeout(() => {
//         setProgress(1)
//       }, delay)
//       return () => clearTimeout(timer)
//     }
//   }, [animated, delay])
//
//   // Calculate the current endpoint based on progress
//   const currentEndX = startX + (endX - startX) * progress
//   const currentEndY = startY + (endY - startY) * progress
//
//   return (
//     <line
//       x1={startX}
//       y1={startY}
//       x2={currentEndX}
//       y2={currentEndY}
//       stroke="#000"
//       strokeWidth={2}
//       style={{ transition: "all 0.5s ease-out" }}
//     />
//   )
// }

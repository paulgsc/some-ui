// import { useState } from "react"
// import { ConnectingLine } from "@slideshow/components/tree-slideshow/connecting-line"
// import { LadderNode } from "@slideshow/components/tree-slideshow/ladder-node"
// import { useAnimatedNodes, useLadderTree } from "@slideshow/hooks/node-tree"
//
// export const LadderTreeSVG = (): React.JSX.Element => {
//   // Default parameters
//   const [params, setParams] = useState({
//     l: 100, // length between points (now vertical)
//     w: 60, // width of the node
//     r: 10, // radius for curves (not used directly in this implementation)
//     alpha: 45, // angle in degrees for even points (relative to vertical)
//     beta: -45, // angle in degrees for odd points (relative to vertical)
//   })
//
//   // Elements in the ladder
//   const elements = ["A", "B", "C", "D", "E"]
//
//   // Animation speed in milliseconds
//   const [animationSpeed, setAnimationSpeed] = useState(800)
//
//   // Use the custom hook to get calculated points and dimensions
//   const { points, svgBounds } = useLadderTree(elements, params)
//
//   // Animation control
//   const { visibleCount, startAnimation, resetAnimation, animating } =
//     useAnimatedNodes(elements.length, animationSpeed)
//
//   // Update parameters via UI slider
//   const handleParamChange = (param, value) => {
//     setParams((prev) => ({ ...prev, [param]: Number(value) }))
//   }
//
//   // Calculate the viewBox based on the points
//   const viewBox = `${svgBounds.minX} ${svgBounds.minY} ${svgBounds.maxX - svgBounds.minX} ${svgBounds.maxY - svgBounds.minY}`
//
//   return (
//     <div className="flex flex-col items-center">
//       <div className="w-full max-w-4xl">
//         <div className="mb-4 rounded-lg bg-gray-100 p-4">
//           <h2 className="mb-2 text-xl">Parameters</h2>
//           <div className="grid grid-cols-2 gap-4">
//             {Object.entries(params).map(([key, value]) => (
//               <div key={key} className="flex flex-col">
//                 <label className="text-sm font-medium">
//                   {key.toUpperCase()}: {value}
//                 </label>
//                 <input
//                   type="range"
//                   min={key === "alpha" || key === "beta" ? -90 : 10}
//                   max={key === "alpha" || key === "beta" ? 90 : 200}
//                   value={value}
//                   onChange={(e) => handleParamChange(key, e.target.value)}
//                   className="w-full"
//                 />
//               </div>
//             ))}
//           </div>
//
//           <div className="mt-4">
//             <label className="text-sm font-medium">
//               Animation Speed: {animationSpeed}ms
//             </label>
//             <input
//               type="range"
//               min={200}
//               max={2000}
//               step={100}
//               value={animationSpeed}
//               onChange={(e) => setAnimationSpeed(Number(e.target.value))}
//               className="w-full"
//             />
//           </div>
//
//           <div className="mt-4 flex gap-4">
//             <button
//               onClick={startAnimation}
//               disabled={animating || visibleCount >= elements.length}
//               className="rounded bg-blue-500 px-4 py-2 text-white disabled:bg-blue-300"
//             >
//               {visibleCount >= elements.length
//                 ? "Animation Complete"
//                 : animating
//                   ? "Animating..."
//                   : "Start Animation"}
//             </button>
//
//             <button
//               onClick={resetAnimation}
//               className="rounded bg-gray-500 px-4 py-2 text-white"
//             >
//               Reset Animation
//             </button>
//           </div>
//         </div>
//
//         <div className="rounded-lg border border-gray-300 bg-white">
//           <svg
//             width="100%"
//             height="500"
//             viewBox={viewBox}
//             preserveAspectRatio="xMidYMid meet"
//           >
//             {/* Draw connecting lines */}
//             {points.slice(0, visibleCount).map((point, i) => {
//               if (i === 0) return null // Skip the first point as it has no incoming line
//               return (
//                 <ConnectingLine
//                   key={`line-${i}`}
//                   startX={points[i - 1].x}
//                   startY={points[i - 1].y}
//                   endX={point.x}
//                   endY={point.y}
//                   animated={true}
//                   delay={(i - 1) * animationSpeed}
//                 />
//               )
//             })}
//
//             {/* Draw nodes */}
//             {points.slice(0, visibleCount).map((point, i) => (
//               <LadderNode
//                 key={`node-${i}`}
//                 id={point.id}
//                 x={point.x}
//                 y={point.y}
//                 width={params.w}
//                 height={params.w * 0.75}
//                 animated={i > 0}
//                 delay={i * animationSpeed - animationSpeed / 2}
//               />
//             ))}
//
//             {/* Draw the dots at midpoints of lines */}
//             {points.slice(0, visibleCount).map((point, i) => {
//               if (i === 0) return null // Skip the first point as it has no incoming line
//               const midX = (points[i - 1].x + point.x) / 2
//               const midY = (points[i - 1].y + point.y) / 2
//               return (
//                 <circle
//                   key={`dot-${i}`}
//                   cx={midX}
//                   cy={midY}
//                   r={3}
//                   fill="black"
//                   style={{
//                     opacity: 0,
//                     animation: `fadeIn 0.3s ease-out ${i * animationSpeed - animationSpeed / 4}ms forwards`,
//                   }}
//                 />
//               )
//             })}
//
//             <style>
//               {`
//               @keyframes fadeIn {
//                 from { opacity: 0; }
//                 to { opacity: 1; }
//               }
//               `}
//             </style>
//           </svg>
//         </div>
//       </div>
//     </div>
//   )
// }

// export const calculatePoints = (elements, params) => {
//   const { initialX, initialY, l, w, r, alpha, beta } = params
//
//   // Start with the first point
//   const points = [
//     {
//       id: elements[0],
//       x: initialX,
//       y: initialY,
//       angle: 0,
//     },
//   ]
//
//   // Calculate the rest of the points based on the parameters
//   for (let i = 1; i < elements.length; i++) {
//     const prevPoint = points[i - 1]
//     const isEven = i % 2 === 0
//
//     // Calculate the next point position
//     // Even points go at angle alpha, odd points at angle beta
//     const angle = isEven ? alpha : beta
//     const distance = l
//
//     // North-South Orientation: Swap x and y calculations, and adjust angles
//     const x = prevPoint.x + distance * Math.sin((angle * Math.PI) / 180) // Changed cos to sin
//     const y = prevPoint.y + distance * Math.cos((angle * Math.PI) / 180) // Changed sin to cos
//
//     points.push({
//       id: elements[i],
//       x,
//       y,
//       angle,
//     })
//   }
//
//   return points
// }

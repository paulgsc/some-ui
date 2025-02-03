export const generateKLEWave = (t: number, numTerms: number): number => {
  let wave = 0
  for (let k = 1; k <= numTerms; k++) {
    const amplitude = Math.random() // Random amplitude
    const phase = Math.random() * 2 * Math.PI // Random phase
    wave += amplitude * Math.sin(2 * Math.PI * k * t + phase) // Add sine wave term
  }
  return wave
}

export const generatePeriodicGP = (
  t: number,
  lengthScale: number,
  period: number
): number => {
  const kernel = Math.exp(
    (-2 * Math.sin((Math.PI * t) / period) ** 2) / lengthScale ** 2
  ) // Periodic kernel
  const noise = Math.random() * 0.1 // Small noise
  return kernel + noise
}

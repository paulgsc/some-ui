export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)

  if (!result) {
    return [234, 179, 8] // fallback to amber
  }

  // Destructure and provide defaults to ensure they are treated as strings
  const [, r = "", g = "", b = ""] = result

  return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)]
}

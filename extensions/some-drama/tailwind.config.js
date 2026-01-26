/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      backdropBlur: {
        xs: "2px",
      },
      zIndex: {
        999999: "999999",
      },
    },
  },
  plugins: [],
  // Prevent Tailwind from interfering with page styles
  corePlugins: {
    preflight: false,
  },
}

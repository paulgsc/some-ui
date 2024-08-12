const baseConfig = require("@some-ui/tailwind-config")

/**@type {import('tailwindcss').Config} */
module.exports = {
  ...baseConfig,
  content: ["src/**/*.{ts,tsx}"],
}

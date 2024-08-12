const baseConfig = require("@some-ui/tailwindcss-config")

/**@type {import('tailwindcss').Config} */
module.exports = {
  ...baseConfig,
  content: ["src/**/*.{ts,tsx}"],
}

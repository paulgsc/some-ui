import path from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pivot-search": path.resolve(__dirname, "./packages/pivot-search/src"),
      "@shared": path.resolve(__dirname, "./packages/shared/src"),
      "@searchbar": path.resolve(__dirname, "./packages/ui/searchbar/src"),
      "@nfl": path.resolve(__dirname, "./packages/ui/nfl/src"),
      // Add more aliases for other packages as needed
    },
  },
  // This allows Vite to resolve packages within the monorepo
  server: {
    fs: {
      allow: [".."],
    },
  },
})

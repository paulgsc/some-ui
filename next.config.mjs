import path from "path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(process.cwd(), "./src"),
      "@pivot-search": path.resolve(
        process.cwd(),
        "./packages/pivot-search/src"
      ),
      "@shared": path.resolve(process.cwd(), "./packages/shared/src"),
      // Add more aliases for other packages as needed
    }
    return config
  },
  experimental: {
    outputFileTracingIncludes: {
      "*": ["../**"],
    },
  },
}

export default nextConfig

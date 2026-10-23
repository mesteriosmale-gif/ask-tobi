import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  typescript: {
    // Netlify build me TypeScript errors ignore karne ke liye
    ignoreBuildErrors: true,
  },
  eslint: {
    // Build ke waqt ESLint errors ignore karne ke liye
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
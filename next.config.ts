import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

// Global polyfills for serverless environment & pdf-parse
if (typeof global.DOMMatrix === 'undefined') {
  ;(global as any).DOMMatrix = class DOMMatrix {}
}
if (typeof global.ImageData === 'undefined') {
  ;(global as any).ImageData = class ImageData {}
}
if (typeof global.Path2D === 'undefined') {
  ;(global as any).Path2D = class Path2D {}
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
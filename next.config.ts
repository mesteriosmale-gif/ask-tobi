import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

// Global polyfills for serverless environment & pdf-parse
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).DOMMatrix = (globalThis as any).DOMMatrix || class DOMMatrix {}
  ;(globalThis as any).ImageData = (globalThis as any).ImageData || class ImageData {}
  ;(globalThis as any).Path2D = (globalThis as any).Path2D || class Path2D {}
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
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pdfjs-dist': false,
        'canvas': false,
        '@napi-rs/canvas': false,
      }
    }
    return config
  },
}

export default nextConfig
import type { MetadataRoute } from 'next'
import { getSiteUrl, isIndexableDeployment } from '../src/siteUrl'

export default function robots(): MetadataRoute.Robots {
  const isIndexable = isIndexableDeployment()

  return {
    rules: {
      userAgent: '*',
      allow: isIndexable ? '/' : undefined,
      disallow: isIndexable ? ['/api/'] : '/',
    },
    sitemap: isIndexable ? new URL('/sitemap.xml', getSiteUrl()).toString() : undefined,
  }
}

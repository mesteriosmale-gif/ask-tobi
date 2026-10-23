import type { MetadataRoute } from 'next'
import { getSiteUrl, isIndexableDeployment } from '../src/siteUrl'

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableDeployment()) {
    return []
  }

  const siteUrl = getSiteUrl()

  return [
    {
      url: siteUrl.toString(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: new URL('/support', siteUrl).toString(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}

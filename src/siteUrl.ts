export function getSiteUrl(): URL {
  const configuredUrl =
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL

  if (!configuredUrl) {
    return new URL('http://localhost:3000')
  }

  const url = new URL(
    /^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`,
  )

  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('SITE_URL must use HTTPS outside localhost.')
  }

  if (url.username || url.password) {
    throw new Error('SITE_URL must not contain credentials.')
  }

  url.pathname = '/'
  url.search = ''
  url.hash = ''

  return url
}

export function isIndexableDeployment(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production'
  }

  return process.env.NODE_ENV === 'production' && Boolean(process.env.SITE_URL)
}

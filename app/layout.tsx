import type { Metadata, Viewport } from 'next'
import { getSiteUrl, isIndexableDeployment } from '../src/siteUrl'
import AuthSessionProvider from '../src/AuthSessionProvider'
import '../src/index.css'
import '../src/App.css'
import './support.css'

const siteUrl = getSiteUrl()
const description =
  'Experience an interactive AI liquid sculpture: a living field of fire-toned particles that shifts with conversation and follows your cursor.'
const isIndexable = isIndexableDeployment()

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'AI Liquid Sculpture | Interactive Generative Art',
    template: '%s | AI Liquid Sculpture',
  },
  description,
  applicationName: 'AI Liquid Sculpture',
  authors: [{ name: 'Developer Kashif' }],
  creator: 'Developer Kashif',
  keywords: [
    'AI liquid sculpture',
    'interactive generative art',
    'AI particle animation',
    '3D particle sculpture',
    'Gemini AI art',
  ],
  alternates: { canonical: siteUrl },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  robots: {
    index: isIndexable,
    follow: isIndexable,
    googleBot: {
      index: isIndexable,
      follow: isIndexable,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'AI Liquid Sculpture',
    title: 'AI Liquid Sculpture | Interactive Generative Art',
    description,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'AI Liquid Sculpture — interactive fire-toned generative particle art',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Liquid Sculpture | Interactive Generative Art',
    description,
    images: ['/opengraph-image'],
  },
}

export const viewport: Viewport = {
  themeColor: '#080808',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AI Liquid Sculpture',
    description,
    url: siteUrl.toString(),
    creator: {
      '@type': 'Person',
      name: 'Developer Kashif',
    },
  }

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  )
}

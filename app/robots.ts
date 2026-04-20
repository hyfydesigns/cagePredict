import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        disallow:  ['/admin', '/api/', '/dashboard', '/profile/edit', '/onboarding', '/invite/'],
      },
    ],
    sitemap: 'https://cagepredict.com/sitemap.xml',
  }
}

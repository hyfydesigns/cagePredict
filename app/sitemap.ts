import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

const BASE_URL = 'https://cagepredict.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const { data: events } = await supabase
    .from('events')
    .select('name, date, updated_at')
    .order('date', { ascending: false })
    .limit(50)

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url:              `${BASE_URL}/events/${slugify(e.name)}`,
    lastModified:     new Date(e.date),
    changeFrequency:  'daily' as const,
    priority:         0.8,
  }))

  return [
    {
      url:             BASE_URL,
      lastModified:    new Date(),
      changeFrequency: 'hourly',
      priority:        1,
    },
    {
      url:             `${BASE_URL}/leaderboard`,
      lastModified:    new Date(),
      changeFrequency: 'hourly',
      priority:        0.7,
    },
    {
      url:             `${BASE_URL}/login`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.4,
    },
    {
      url:             `${BASE_URL}/signup`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.5,
    },
    ...eventUrls,
  ]
}

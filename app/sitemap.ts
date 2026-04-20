import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

const BASE_URL = 'https://cagepredict.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const [{ data: events }, { data: fighters }] = await Promise.all([
    supabase
      .from('events')
      .select('name, date, updated_at')
      .order('date', { ascending: false })
      .limit(50),
    supabase
      .from('fighters')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200),
  ])

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url:              `${BASE_URL}/events/${slugify(e.name)}`,
    lastModified:     new Date(e.date),
    changeFrequency:  'daily' as const,
    priority:         0.8,
  }))

  const fighterUrls: MetadataRoute.Sitemap = (fighters ?? []).map((f) => ({
    url:              `${BASE_URL}/fighters/${f.id}`,
    lastModified:     f.updated_at ? new Date(f.updated_at) : new Date(),
    changeFrequency:  'weekly' as const,
    priority:         0.6,
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
      url:             `${BASE_URL}/standings`,
      lastModified:    new Date(),
      changeFrequency: 'daily',
      priority:        0.6,
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
    {
      url:             `${BASE_URL}/help`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.4,
    },
    {
      url:             `${BASE_URL}/privacy`,
      lastModified:    new Date(),
      changeFrequency: 'yearly',
      priority:        0.2,
    },
    {
      url:             `${BASE_URL}/terms`,
      lastModified:    new Date(),
      changeFrequency: 'yearly',
      priority:        0.2,
    },
    ...eventUrls,
    ...fighterUrls,
  ]
}

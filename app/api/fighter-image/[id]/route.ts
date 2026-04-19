import { NextRequest, NextResponse } from 'next/server'
import { uuidToApiSportsId } from '@/lib/apis/api-sports'

/**
 * Fighter image proxy.
 *
 * The `id` parameter is the fighter's UUID from the DB.
 *
 * Routing logic:
 *  - api-sports.io fighters (UUID prefix 0004) → images are stored as direct URLs
 *    in fighters.image_url — this route is not needed, but handled gracefully.
 *  - RapidAPI fighters (UUID prefix 0001) → proxy the image from RapidAPI.
 *  - Plain integer ID (legacy) → assume RapidAPI.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Check if this is an api-sports.io UUID
  const apiSportsIntId = uuidToApiSportsId(id)
  if (apiSportsIntId !== null) {
    // api-sports.io fighter images are stored directly in fighters.image_url
    // This route shouldn't normally be called for them, but return 404 gracefully.
    return new NextResponse('Use the direct image_url from the fighters table', { status: 404 })
  }

  // Legacy RapidAPI path — extract integer ID from UUID or raw value
  let apiId: number

  // Try as UUID (00000000-0000-0001-0000-XXXXXXXXXXXX)
  const parts = id.split('-')
  if (parts.length === 5) {
    const n = parseInt(parts[4], 10)
    if (isNaN(n) || n === 0) return new NextResponse('Invalid UUID', { status: 400 })
    apiId = n
  } else {
    // Plain integer fallback (legacy image_url: /api/fighter-image/12345)
    apiId = parseInt(id, 10)
    if (isNaN(apiId)) return new NextResponse('Invalid ID', { status: 400 })
  }

  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) return new NextResponse('Not configured', { status: 500 })

  const res = await fetch(`https://${host}/api/mma/team/${apiId}/image`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
    next: { revalidate: 86400 },
  })

  if (!res.ok) return new NextResponse('Not found', { status: 404 })

  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'image/webp'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}

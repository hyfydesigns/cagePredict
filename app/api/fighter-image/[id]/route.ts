import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const apiId = parseInt(id, 10)
  if (isNaN(apiId)) return new NextResponse('Invalid ID', { status: 400 })

  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) return new NextResponse('Not configured', { status: 500 })

  const res = await fetch(`https://${host}/api/mma/team/${apiId}/image`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
    next: { revalidate: 86400 }, // cache for 24h
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

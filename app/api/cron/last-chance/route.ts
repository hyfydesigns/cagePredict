import { NextResponse, type NextRequest } from 'next/server'
import { sendLastChanceEmails } from '@/lib/actions/emails'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sent, skipped } = await sendLastChanceEmails()
  return NextResponse.json({ ok: true, sent, skipped })
}

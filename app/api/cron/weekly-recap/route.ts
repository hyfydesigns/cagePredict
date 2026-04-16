import { NextResponse } from 'next/server'
import { sendWeeklyRecapEmails } from '@/lib/actions/emails'

// Vercel Cron calls this every Monday at 9 AM UTC.
// Protected by CRON_SECRET to prevent unauthorized invocations.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendWeeklyRecapEmails()
    return NextResponse.json({
      ok:     true,
      sent:   result.sent,
      errors: result.errors,
    })
  } catch (err) {
    console.error('[cron/weekly-recap]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

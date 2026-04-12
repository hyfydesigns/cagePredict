/**
 * Seed runner — run with: npx tsx seeds/run-seed.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 * Copy .env.example → .env.local, then:
 *   npx dotenv -e .env.local -- tsx seeds/run-seed.ts
 * Or simply export the variables before running.
 */

import { createClient } from '@supabase/supabase-js'
import { SEED_FIGHTERS, SEED_EVENTS } from './seed-data'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '\n❌  Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n'
  )
  process.exit(1)
}

// Use untyped client for seed — avoids the `never` inference on insert
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  console.log('\n🥊  CagePredict seed starting...\n')

  // ── 1. Fighters ──────────────────────────────────────────────
  console.log(`Upserting ${SEED_FIGHTERS.length} fighters...`)
  const { error: fErr } = await supabase
    .from('fighters')
    .upsert(SEED_FIGHTERS as any, { onConflict: 'id' })
  if (fErr) { console.error('Fighters:', fErr.message); process.exit(1) }
  console.log('  ✅ Fighters done')

  // ── 2. Events + Fights ────────────────────────────────────────
  for (const eventData of SEED_EVENTS) {
    const { fights, ...event } = eventData

    console.log(`\nUpserting event: ${event.name}`)
    const { data: ev, error: evErr } = await (supabase
      .from('events')
      .upsert(event as any, { onConflict: 'id' })
      .select('id')
      .single() as any)

    if (evErr || !ev) {
      console.error('  ❌ Event error:', evErr?.message)
      continue
    }
    console.log(`  ✅ Event ${(ev as any).id}`)

    console.log(`  Upserting ${fights.length} fights...`)
    const { error: fightErr } = await supabase
      .from('fights')
      .upsert(fights as any, { onConflict: 'id' })

    if (fightErr) {
      console.error('  ❌ Fights error:', fightErr.message)
    } else {
      console.log(`  ✅ ${fights.length} fights upserted`)
    }
  }

  console.log('\n🏆  Seed complete!\n')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

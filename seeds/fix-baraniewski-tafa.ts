/**
 * One-shot fix: restore Baraniewski vs Tafa from 'cancelled' → 'upcoming'
 *
 * Run with:
 *   npx tsx seeds/fix-baraniewski-tafa.ts
 *
 * Reads .env.local automatically — no extra setup needed.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Load .env.local without requiring the dotenv package ──────────────────────
const envFile = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

async function main() {
  // ── 1. Find both fighters ─────────────────────────────────────────────────
  const { data: fighters, error: fErr } = await supabase
    .from('fighters')
    .select('id, name')
    .or('name.ilike.%Baraniewski%,name.ilike.%Tafa%')

  if (fErr)          { console.error('Fighter lookup failed:', fErr.message); process.exit(1) }
  if (!fighters?.length) { console.error('❌  No fighters found matching "Baraniewski" or "Tafa"'); process.exit(1) }

  console.log('Fighters found:')
  fighters.forEach((f: any) => console.log(`  ${f.id}  ${f.name}`))

  const baraniewski = fighters.find((f: any) => norm(f.name).includes('baraniewski'))
  const tafa        = fighters.find((f: any) => norm(f.name).includes('tafa'))

  if (!baraniewski) { console.error('❌  Could not identify Baraniewski'); process.exit(1) }
  if (!tafa)        { console.error('❌  Could not identify Tafa');        process.exit(1) }

  console.log(`\nUsing: ${baraniewski.name} (${baraniewski.id})  vs  ${tafa.name} (${tafa.id})`)

  // ── 2. Find the fight between them ────────────────────────────────────────
  const { data: fights, error: fightErr } = await supabase
    .from('fights')
    .select('id, status, event_id, events!inner(name, date)')
    .or(
      `and(fighter1_id.eq.${baraniewski.id},fighter2_id.eq.${tafa.id}),` +
      `and(fighter1_id.eq.${tafa.id},fighter2_id.eq.${baraniewski.id})`
    )

  if (fightErr)      { console.error('Fight lookup failed:', fightErr.message); process.exit(1) }
  if (!fights?.length) { console.error('❌  No fight found between these two fighters'); process.exit(1) }

  console.log('\nFight(s) found:')
  fights.forEach((f: any) =>
    console.log(`  id=${f.id}  status=${f.status}  event="${(f.events as any)?.name}" (${(f.events as any)?.date})`)
  )

  // ── 3. Restore any that are incorrectly 'cancelled' ───────────────────────
  const toFix = fights.filter((f: any) => f.status === 'cancelled')

  if (!toFix.length) {
    console.log('\n✅  Fight is not currently cancelled — no action needed.')
    process.exit(0)
  }

  for (const fight of toFix) {
    const { error: upErr } = await supabase
      .from('fights')
      .update({ status: 'upcoming' })
      .eq('id', fight.id)

    if (upErr) {
      console.error(`❌  Update failed for fight ${fight.id}:`, upErr.message)
      process.exit(1)
    }
    console.log(`\n✅  Fight ${fight.id}: cancelled → upcoming`)
  }

  // ── 4. Confirm ─────────────────────────────────────────────────────────────
  const { data: confirmed } = await supabase
    .from('fights')
    .select('id, status')
    .or(
      `and(fighter1_id.eq.${baraniewski.id},fighter2_id.eq.${tafa.id}),` +
      `and(fighter1_id.eq.${tafa.id},fighter2_id.eq.${baraniewski.id})`
    )

  console.log('\nConfirmed status:')
  confirmed?.forEach((f: any) => console.log(`  id=${f.id}  status=${f.status}`))
}

main().catch((e) => { console.error(e); process.exit(1) })

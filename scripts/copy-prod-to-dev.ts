/**
 * copy-prod-to-dev.ts
 *
 * Full production → dev data copy:
 *   auth.users  → recreated in dev with same UUIDs (temp password: DevCage2025!)
 *   profiles    → copied after users exist
 *   predictions → copied after fights + users exist
 *   crews       → copied after users exist
 *   crew_members→ copied after crews + users exist
 *   friends     → copied after users exist
 *   fighters    → copied (no auth dependency)
 *   events      → copied (no auth dependency)
 *   fights      → copied (no auth dependency)
 *
 * Passwords cannot be transferred between Supabase projects.
 * All dev users get a temporary password: DevCage2025!
 * Users can reset their password via "Forgot password" on the dev site.
 *
 * Run:
 *   npx tsx scripts/copy-prod-to-dev.ts
 */

import { createClient } from '@supabase/supabase-js'

const PROD_URL = 'https://zzcstturzukwqjpmefsa.supabase.co'
const PROD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Y3N0dHVyenVrd3FqcG1lZnNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAxMTUwMywiZXhwIjoyMDkxNTg3NTAzfQ.KVTD72YZWJGrH6ZBPpVV6OXVEja_ZxV-PzGA9tQmobc'

const DEV_URL  = 'https://gjjtsqhryvqsdxgybvce.supabase.co'
const DEV_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqanRzcWhyeXZxc2R4Z3lidmNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUzMTEyMywiZXhwIjoyMDkyMTA3MTIzfQ.Rii9oKoBPCu4qr-hv98vJqc-DsAlr0UFn5C5Z_8seAg'

const DEV_TEMP_PASSWORD = 'DevCage2025!'

const prod = createClient(PROD_URL, PROD_KEY)
const dev  = createClient(DEV_URL,  DEV_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`) }

async function fetchAll<T>(client: ReturnType<typeof createClient>, table: string): Promise<T[]> {
  const rows: T[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`fetchAll(${table}) @ ${from}: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function stripMissingCols<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows
  const devCols = new Set<string>()
  for (const col of Object.keys(rows[0])) {
    const { error } = await dev.from(table).select(col).limit(1)
    if (!error) devCols.add(col)
  }
  return rows.map((r) => {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) if (devCols.has(k)) clean[k] = v
    return clean as T
  })
}

async function upsertAll(
  client: ReturnType<typeof createClient>,
  table: string,
  rows: unknown[],
  conflictCol = 'id',
): Promise<number> {
  if (!rows.length) return 0
  const BATCH = 200
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await client
      .from(table)
      .upsert(batch as any, { onConflict: conflictCol, ignoreDuplicates: false })
    if (error) throw new Error(`upsertAll(${table}) batch ${i / BATCH}: ${error.message}`)
    count += batch.length
  }
  return count
}

async function clearTable(client: ReturnType<typeof createClient>, table: string) {
  const { error } = await client
    .from(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw new Error(`clearTable(${table}): ${error.message}`)
}

// ─── Auth users ───────────────────────────────────────────────────────────────

async function copyUsers(): Promise<void> {
  log('Fetching users from production auth.users…')
  const prodUsers: any[] = []
  let page = 1
  while (true) {
    const { data, error } = await prod.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`)
    if (!data.users.length) break
    prodUsers.push(...data.users)
    if (data.users.length < 1000) break
    page++
  }
  log(`  → ${prodUsers.length} users`)

  // Get existing dev user IDs so we don't duplicate
  const { data: existing } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existingIds = new Set((existing?.users ?? []).map((u: any) => u.id))

  let created = 0, skipped = 0, failed = 0
  for (const user of prodUsers) {
    if (existingIds.has(user.id)) { skipped++; continue }

    // Use raw fetch so we can pass `id` — the JS SDK omits it from the type
    // but the Supabase Auth Admin REST API accepts it to preserve UUIDs.
    const res = await fetch(`${DEV_URL}/auth/v1/admin/users`, {
      method:  'POST',
      headers: {
        apikey:         DEV_KEY,
        Authorization:  `Bearer ${DEV_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id:             user.id,            // preserve original UUID
        email:          user.email,
        password:       DEV_TEMP_PASSWORD,
        email_confirm:  true,
        phone:          user.phone || undefined,
        user_metadata:  user.user_metadata ?? {},
        app_metadata:   user.app_metadata  ?? {},
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg  = body?.msg ?? body?.message ?? res.statusText
      if (msg?.includes('already been registered') || msg?.includes('already exists') || res.status === 422) {
        skipped++
      } else {
        console.warn(`    ⚠ Failed to create ${user.email}: ${msg}`)
        failed++
      }
    } else {
      created++
    }
  }

  log(`  ✓ ${created} created, ${skipped} already existed, ${failed} failed`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Starting full production → dev data copy')
  log(`  PROD: ${PROD_URL}`)
  log(`  DEV:  ${DEV_URL}`)
  console.log()

  // ── 1. Auth users ──────────────────────────────────────────────────────────
  // Delete any previously copied users (wrong UUIDs) before re-creating
  log('Clearing existing dev auth users…')
  const { data: existingDevUsers } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 })
  let deleted = 0
  for (const u of existingDevUsers?.users ?? []) {
    const { error } = await dev.auth.admin.deleteUser(u.id)
    if (!error) deleted++
  }
  log(`  cleared ${deleted} users`)
  console.log()

  await copyUsers()
  console.log()

  // ── 2. Non-auth tables ─────────────────────────────────────────────────────
  log('Fetching fighters…');  const fighters = await fetchAll(prod, 'fighters'); log(`  → ${fighters.length}`)
  log('Fetching events…');    const events   = await fetchAll(prod, 'events');   log(`  → ${events.length}`)
  log('Fetching fights…');    const fights   = await fetchAll(prod, 'fights');   log(`  → ${fights.length}`)
  console.log()

  // ── 3. Auth-dependent tables ───────────────────────────────────────────────
  log('Fetching profiles…');     const profiles    = await fetchAll(prod, 'profiles');     log(`  → ${profiles.length}`)
  log('Fetching predictions…');  const predictions = await fetchAll(prod, 'predictions');  log(`  → ${predictions.length}`)
  log('Fetching crews…');        const crews       = await fetchAll(prod, 'crews');        log(`  → ${crews.length}`)
  log('Fetching crew_members…'); const crewMembers = await fetchAll(prod, 'crew_members'); log(`  → ${crewMembers.length}`)
  log('Fetching friends…');      const friends     = await fetchAll(prod, 'friends');      log(`  → ${friends.length}`)
  console.log()

  // ── 4. Strip missing columns ───────────────────────────────────────────────
  log('Checking dev column compatibility…')
  const safeFighters    = await stripMissingCols('fighters',    fighters    as any[])
  const safeEvents      = await stripMissingCols('events',      events      as any[])
  const safeFights      = await stripMissingCols('fights',      fights      as any[])
  const safeProfiles    = await stripMissingCols('profiles',    profiles    as any[])
  const safePredictions = await stripMissingCols('predictions', predictions as any[])
  const safeCrews       = await stripMissingCols('crews',       crews       as any[])
  const safeMembers     = await stripMissingCols('crew_members', crewMembers as any[])
  const safeFriends     = await stripMissingCols('friends',     friends     as any[])
  log('  ✓ Done')
  console.log()

  // ── 5. Clear dev in safe reverse-FK order ─────────────────────────────────
  log('Clearing dev tables…')
  for (const t of ['friends', 'crew_members', 'crews', 'predictions', 'fights', 'events', 'fighters', 'profiles']) {
    await clearTable(dev, t)
    log(`  cleared ${t}`)
  }
  console.log()

  // ── 6. Insert in FK order ──────────────────────────────────────────────────
  log('Inserting fighters…');    log(`  ✓ ${await upsertAll(dev, 'fighters',    safeFighters)}`)
  log('Inserting events…');      log(`  ✓ ${await upsertAll(dev, 'events',      safeEvents)}`)
  log('Inserting fights…');      log(`  ✓ ${await upsertAll(dev, 'fights',      safeFights)}`)
  log('Inserting profiles…');    log(`  ✓ ${await upsertAll(dev, 'profiles',    safeProfiles)}`)
  log('Inserting predictions…'); log(`  ✓ ${await upsertAll(dev, 'predictions', safePredictions)}`)
  log('Inserting crews…');       log(`  ✓ ${await upsertAll(dev, 'crews',       safeCrews)}`)
  log('Inserting crew_members…');log(`  ✓ ${await upsertAll(dev, 'crew_members',safeMembers)}`)
  log('Inserting friends…');     log(`  ✓ ${await upsertAll(dev, 'friends',     safeFriends)}`)

  console.log()
  log('✅ All done!')
  log(`All dev users have temporary password: ${DEV_TEMP_PASSWORD}`)
  log('Users can log in with their production email + that password,')
  log('or use "Forgot password" to set their own.')
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})

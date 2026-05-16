'use server'

/**
 * App-wide settings stored in the `app_settings` Supabase table.
 *
 * Required SQL (run once in Supabase SQL editor):
 *   CREATE TABLE IF NOT EXISTS app_settings (
 *     key   text PRIMARY KEY,
 *     value jsonb NOT NULL
 *   );
 *   -- Seed the default bookmaker visibility:
 *   INSERT INTO app_settings (key, value)
 *   VALUES ('visible_bookmakers', '["draftkings","fanduel","bovada"]'::jsonb)
 *   ON CONFLICT (key) DO NOTHING;
 */

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { FEATURED_BOOKMAKER_KEYS } from '@/lib/affiliates'

// ── Visible bookmakers ────────────────────────────────────────────────────────

/**
 * Returns the list of bookmaker keys that should be shown on fight cards.
 * Falls back to the 3 defaults if the table doesn't exist or has no row yet.
 */
export async function getVisibleBookmakerKeys(): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'visible_bookmakers')
      .single()
    if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
      return data.value as string[]
    }
  } catch {
    // table not created yet — fall through to default
  }
  return FEATURED_BOOKMAKER_KEYS
}

/**
 * Persists the visible bookmaker keys. Creates or updates the row.
 * Revalidates the home + admin pages so the change is reflected immediately.
 */
export async function saveVisibleBookmakerKeys(keys: string[]): Promise<{ error?: string }> {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { error: 'At least one bookmaker must be selected' }
  }
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'visible_bookmakers', value: keys })
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/admin')
    return {}
  } catch (e) {
    return { error: `Table not found — run the setup SQL first. (${String(e)})` }
  }
}

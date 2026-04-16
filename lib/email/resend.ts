import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder')

// Always wrap with the display name so email clients show "CagePredict"
// rather than the raw local-part of the address (e.g. "picks")
const _from = process.env.RESEND_FROM_EMAIL ?? 'noreply@cagepredict.com'
export const FROM_ADDRESS = _from.includes('<')
  ? _from                              // already has a display name — use as-is
  : `CagePredict <${_from}>`           // bare address — wrap it

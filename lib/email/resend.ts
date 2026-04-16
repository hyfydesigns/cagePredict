import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder')

// Extract the raw email address from the env var (strips any existing display name)
// then always prefix with "CagePredict" so every email shows the brand name.
const _raw = process.env.RESEND_FROM_EMAIL ?? 'noreply@cagepredict.com'
const _emailMatch = _raw.match(/<(.+?)>/)
const _emailAddress = _emailMatch ? _emailMatch[1] : _raw.trim()
export const FROM_ADDRESS = `CagePredict <${_emailAddress}>`

import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder')

export const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? 'CagePredict <picks@cagepredict.com>'

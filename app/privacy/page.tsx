import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How CagePredict collects, uses, and protects your personal information.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="text-zinc-400 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  const updated = 'April 17, 2025'

  return (
    <div className="container mx-auto py-12 max-w-2xl px-4">
      <div className="mb-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Legal</p>
        <h1 className="text-3xl font-black text-white">Privacy Policy</h1>
        <p className="text-zinc-500 text-sm mt-2">Last updated: {updated}</p>
      </div>

      <div className="space-y-8">
        <Section title="Who we are">
          <p>
            CagePredict is a free-to-play UFC fight prediction game. We are not affiliated with the
            UFC, Zuffa LLC, or any official MMA organisation. We do not accept real money, offer
            prizes, or operate as a gambling service.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>We collect only what is necessary to operate the game:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-zinc-300">Account data</strong> — email address, username, display name, and avatar emoji you choose during sign-up.</li>
            <li><strong className="text-zinc-300">Prediction data</strong> — the fight picks you submit, confidence selections, and your points/streak history.</li>
            <li><strong className="text-zinc-300">Crew data</strong> — crews you create or join, and messages you post.</li>
            <li><strong className="text-zinc-300">Usage data</strong> — standard server logs (IP address, browser type, pages visited) retained for up to 30 days for security purposes.</li>
          </ul>
          <p>We do not collect payment information. We do not collect real-name, address, or date of birth.</p>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>To operate your account and save your predictions.</li>
            <li>To display your username and score on the public leaderboard.</li>
            <li>To send transactional emails (event reminders, weekly recaps) — only if you have opted in.</li>
            <li>To investigate abuse or violations of our Terms of Service.</li>
          </ul>
          <p>We do not sell, rent, or trade your personal information to third parties.</p>
        </Section>

        <Section title="Data storage">
          <p>
            Your data is stored in a Supabase-managed PostgreSQL database hosted on AWS infrastructure
            in the US East region. Supabase is SOC 2 Type II certified. Data is encrypted at rest and
            in transit (TLS 1.2+).
          </p>
        </Section>

        <Section title="Third-party services">
          <p>We use the following third-party services to operate CagePredict:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-zinc-300">Supabase</strong> — authentication and database hosting.</li>
            <li><strong className="text-zinc-300">Vercel</strong> — web hosting and serverless functions.</li>
            <li><strong className="text-zinc-300">Resend</strong> — transactional email delivery.</li>
            <li><strong className="text-zinc-300">RapidAPI / MMA API</strong> — UFC event and fighter data.</li>
          </ul>
          <p>Each provider has their own privacy policy and security practices.</p>
        </Section>

        <Section title="Cookies">
          <p>
            We use a single session cookie to keep you signed in. We do not use advertising cookies,
            tracking pixels, or third-party analytics cookies.
          </p>
        </Section>

        <Section title="Your rights">
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-zinc-300">Access</strong> — request a copy of the data we hold about you.</li>
            <li><strong className="text-zinc-300">Correction</strong> — update your username, display name, or email at any time in your profile settings.</li>
            <li><strong className="text-zinc-300">Deletion</strong> — permanently delete your account and all associated data from your profile settings. Deletion is immediate and irreversible.</li>
            <li><strong className="text-zinc-300">Opt-out</strong> — unsubscribe from email notifications at any time in your profile settings.</li>
          </ul>
        </Section>

        <Section title="Children">
          <p>
            CagePredict is not directed at children under 13. If you believe a child under 13 has
            created an account, please contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. We will notify registered users by email
            of any material changes. Continued use of the service after changes are posted
            constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests regarding your data? Reach us at{' '}
            <a href="mailto:privacy@cagepredict.com" className="text-primary hover:underline">
              privacy@cagepredict.com
            </a>
            .
          </p>
        </Section>

        <div className="pt-4 border-t border-zinc-800 flex gap-4 text-xs text-zinc-500">
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
          <Link href="/help" className="hover:text-zinc-300 transition-colors">Help</Link>
          <Link href="/" className="hover:text-zinc-300 transition-colors">Back to Fight Card</Link>
        </div>
      </div>
    </div>
  )
}

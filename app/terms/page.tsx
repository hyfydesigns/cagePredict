import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules and conditions for using CagePredict.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="text-foreground-muted text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  const updated = 'April 17, 2025'

  return (
    <div className="container mx-auto py-12 max-w-2xl px-4">
      <div className="mb-8">
        <p className="text-xs text-foreground-muted uppercase tracking-widest mb-2">Legal</p>
        <h1 className="text-3xl font-black text-foreground">Terms of Service</h1>
        <p className="text-foreground-muted text-sm mt-2">Last updated: {updated}</p>
      </div>

      <div className="space-y-8">
        <Section title="Acceptance of terms">
          <p>
            By creating an account or using CagePredict, you agree to these Terms of Service
            and our{' '}
            <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            If you do not agree, please do not use the service.
          </p>
        </Section>

        <Section title="What CagePredict is">
          <p>
            CagePredict is a <strong className="text-foreground-secondary">free-to-play entertainment game</strong>.
            Players predict the outcomes of UFC fights and earn points on a virtual leaderboard.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>No real money is wagered or won.</li>
            <li>Points have no monetary value and cannot be redeemed or transferred.</li>
            <li>CagePredict is not a sportsbook, betting platform, or gambling service.</li>
            <li>We are not affiliated with the UFC, Zuffa LLC, or any official MMA organisation.</li>
          </ul>
        </Section>

        <Section title="Eligibility">
          <p>
            You must be at least 13 years old to create an account. By registering, you confirm
            that you meet this requirement. Users in jurisdictions where online prediction games are
            restricted are responsible for ensuring their own compliance with local laws.
          </p>
        </Section>

        <Section title="Your account">
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>You are responsible for maintaining the security of your account and password.</li>
            <li>You may not create more than one account per person.</li>
            <li>You may not share your account with others.</li>
            <li>Usernames must not impersonate real people, brands, or other users.</li>
            <li>Usernames and content must not contain offensive, hateful, or illegal material.</li>
          </ul>
        </Section>

        <Section title="Predictions and scoring">
          <p>
            Predictions are for entertainment only. Submission of a pick does not guarantee a
            specific score outcome — fight results are pulled from official sources and final
            scores are applied automatically. In the event of a scoring error, we reserve the
            right to correct it.
          </p>
          <p>
            Picks lock <strong className="text-foreground-secondary">2 hours before each scheduled fight time</strong>.
            Late picks are not accepted. We are not responsible for picks not submitted before the cutoff.
          </p>
        </Section>

        <Section title="Crews (private leagues)">
          <p>
            Crews are private groups created by users. CagePredict is not responsible for the
            conduct of crew members. Crew owners are responsible for the appropriateness of their
            crew name and any invitations issued.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Use the service for any unlawful purpose.</li>
            <li>Attempt to manipulate leaderboard scores through automated means or exploits.</li>
            <li>Harass, abuse, or harm other users.</li>
            <li>Scrape, reverse-engineer, or reproduce any part of the service without permission.</li>
            <li>Use the service in a way that disrupts or degrades performance for other users.</li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate these terms,
            with or without notice.
          </p>
        </Section>

        <Section title="Intellectual property">
          <p>
            All content, design, and code on CagePredict is owned by or licensed to us.
            Fighter names, event names, and UFC trademarks belong to their respective owners.
            We use fighter and event data for informational and entertainment purposes under
            fair use principles.
          </p>
        </Section>

        <Section title="Service availability">
          <p>
            We aim to keep CagePredict available at all times but make no guarantees of uptime.
            The service may be unavailable during maintenance, updates, or outages. We are not
            liable for missed picks or data loss due to downtime.
          </p>
        </Section>

        <Section title="Disclaimer of warranties">
          <p>
            CagePredict is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.
            Predictions, analysis, and AI-generated content are for entertainment only and should
            not be relied upon for any financial or betting decisions.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, CagePredict and its operators shall not be
            liable for any indirect, incidental, or consequential damages arising from your use
            of the service.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms at any time. We will notify registered users of material
            changes via email. Continued use of the service after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Email us at{' '}
            <a href="mailto:legal@cagepredict.com" className="text-primary hover:underline">
              legal@cagepredict.com
            </a>
            .
          </p>
        </Section>

        <div className="pt-4 border-t border-border flex gap-4 text-xs text-foreground-muted">
          <Link href="/privacy" className="hover:text-foreground-secondary transition-colors">Privacy Policy</Link>
          <Link href="/help" className="hover:text-foreground-secondary transition-colors">Help</Link>
          <Link href="/" className="hover:text-foreground-secondary transition-colors">Back to Fight Card</Link>
        </div>
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: 'Learn how to play CagePredict, understand scoring, and get answers to common questions.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-black text-foreground border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  )
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-2">
      <p className="font-semibold text-foreground text-sm">{q}</p>
      <div className="text-foreground-muted text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-black text-sm">
        {n}
      </div>
      <div className="space-y-1 pt-0.5">
        <p className="font-semibold text-foreground text-sm">{title}</p>
        <p className="text-foreground-muted text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="container mx-auto py-12 max-w-2xl px-4 space-y-12">
      {/* Header */}
      <div>
        <p className="text-xs text-foreground-muted uppercase tracking-widest mb-2">Support</p>
        <h1 className="text-3xl font-black text-foreground">Help &amp; FAQ</h1>
        <p className="text-foreground-muted mt-2 text-sm">
          Everything you need to know about playing CagePredict.
        </p>
      </div>

      {/* How to play */}
      <Section title="How to play">
        <div className="space-y-5">
          <Step n={1} title="Create a free account">
            Sign up with your email, choose a username and emoji avatar. No payment required — CagePredict is completely free to play.
          </Step>
          <Step n={2} title="Pick the winner of each fight">
            On the home Fight Card, tap or click the fighter you think will win each bout. You can change your pick right up until it locks.
          </Step>
          <Step n={3} title="Set your Confidence Pick">
            Once per event you can mark one pick as your <strong className="text-amber-400">🔒 Confidence Pick</strong> — this doubles your points to 20 if correct. Choose wisely.
          </Step>
          <Step n={4} title="Picks lock before each fight">
            Picks lock <strong className="text-foreground">2 hours before the scheduled fight time</strong>. You&apos;ll see a live countdown on each fight card showing when your window closes.
          </Step>
          <Step n={5} title="Results update automatically">
            Once a fight finishes, results are pulled in automatically and your score updates instantly. No manual refresh needed.
          </Step>
          <Step n={6} title="Climb the leaderboard">
            Your points accumulate across all events. Check the Leaderboard to see how you rank globally, and Standings for historical performance.
          </Step>
        </div>
      </Section>

      {/* Scoring */}
      <Section title="Scoring system">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Correct pick', pts: '+10 pts', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
            { label: 'Confidence pick (correct)', pts: '+20 pts', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Wrong pick', pts: '0 pts', color: 'text-foreground-muted', bg: 'bg-surface-2/60 border-border/40' },
            { label: 'Confidence pick (wrong)', pts: '0 pts', color: 'text-foreground-muted', bg: 'bg-surface-2/60 border-border/40' },
          ].map(({ label, pts, color, bg }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <p className="text-foreground-secondary text-sm">{label}</p>
              <p className={`text-2xl font-black mt-1 ${color}`}>{pts}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-4 mt-2">
          <p className="font-semibold text-foreground text-sm mb-3">Streak bonuses</p>
          <p className="text-foreground-muted text-xs mb-3">Get on a roll and earn bonus points per correct pick:</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[
              { streak: '3–4 in a row', bonus: '+5 pts', color: 'text-blue-400' },
              { streak: '5–9 in a row', bonus: '+10 pts', color: 'text-purple-400' },
              { streak: '10+ in a row', bonus: '+20 pts', color: 'text-amber-400' },
            ].map(({ streak, bonus, color }) => (
              <div key={streak} className="rounded-lg bg-surface-2/60 p-2">
                <p className={`font-black ${color}`}>{bonus}</p>
                <p className="text-foreground-muted text-[10px] mt-0.5">{streak}</p>
              </div>
            ))}
          </div>
          <p className="text-foreground-muted text-xs mt-3">
            Streak resets to 0 on any incorrect pick. Streak is tracked across all events.
          </p>
        </div>
      </Section>

      {/* Crews */}
      <Section title="Crews (private leagues)">
        <div className="space-y-3 text-foreground-muted text-sm leading-relaxed">
          <p>
            <strong className="text-foreground">Crews</strong>{' '}are private leagues where you compete against friends.
            Each crew has its own mini-leaderboard showing only members&apos; scores.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Go to <strong className="text-foreground">Crews</strong> in the nav and tap <strong className="text-foreground">Create Crew</strong>.</li>
            <li>Share the invite link with friends, or invite by username from the crew page.</li>
            <li>Crew members see each other&apos;s picks and scores for all events.</li>
            <li>Only the crew owner can delete a crew (this is permanent and removes all members).</li>
            <li>You can leave a crew at any time from the crew page.</li>
          </ul>
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Frequently asked questions">
        <div className="space-y-3">
          <FAQ q="Is CagePredict free?">
            Yes — completely free. There are no paid tiers, no in-app purchases, and no premium features. Points have no real-world value.
          </FAQ>

          <FAQ q="Can I change my pick after submitting?">
            Yes, you can update your pick for any fight right up until the lock time (2 hours before the fight). Once locked, picks are final.
          </FAQ>

          <FAQ q="What happens if a fight is cancelled or ruled a No Contest?">
            Cancelled fights or No Contests are not scored — picks for those fights are voided and no points are awarded or deducted.
          </FAQ>

          <FAQ q="Why did I lose my streak?">
            A streak resets to zero any time you submit an incorrect pick. Missing a fight (not submitting a pick before lockout) does not break your streak, but also earns no points.
          </FAQ>

          <FAQ q="Can I have more than one Confidence Pick per event?">
            No — you can only set one Confidence Pick (the 🔒 lock) per event card. Setting a new lock on a different fight automatically removes the previous one.
          </FAQ>

          <FAQ q="When do results come in?">
            Results are synced automatically, typically within 5–10 minutes of a fight finishing. Your score and the fight card update instantly once a result is confirmed — no page refresh needed.
          </FAQ>

          <FAQ q="How is my leaderboard rank calculated?">
            Rank is based on total points accumulated across all events. In case of a tie, the player with the higher win rate (correct picks ÷ total picks) is ranked higher.
          </FAQ>

          <FAQ q="Can I delete my account?">
            Yes. Go to your Profile → Edit Profile → scroll to the bottom → Delete Account. This permanently removes your account, all picks, and all data. It cannot be undone.
          </FAQ>

          <FAQ q="I signed up via an invite link but didn&apos;t join the crew automatically.">
            Make sure you signed up using the invite link (not a direct /signup URL). After verifying your email and completing onboarding, you should be added to the crew automatically. If not, ask the crew owner to send you a new invite link.
          </FAQ>

          <FAQ q="CagePredict shows the wrong fight result.">
            Results are pulled automatically from a third-party MMA data provider. If you believe a result is incorrect, please contact us at{' '}
            <a href="mailto:support@cagepredict.com" className="text-primary hover:underline">
              support@cagepredict.com
            </a>{' '}
            and we&apos;ll investigate.
          </FAQ>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Still need help?">
        <div className="rounded-xl border border-border bg-surface/60 p-5 text-center space-y-2">
          <p className="text-foreground-muted text-sm">
            Can&apos;t find the answer you&apos;re looking for?
          </p>
          <a
            href="mailto:support@cagepredict.com"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-foreground hover:bg-primary/90 transition-colors"
          >
            Email Support
          </a>
        </div>
      </Section>

      <div className="pt-4 border-t border-border flex gap-4 text-xs text-foreground-muted">
        <Link href="/privacy" className="hover:text-foreground-secondary transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground-secondary transition-colors">Terms of Service</Link>
        <Link href="/" className="hover:text-foreground-secondary transition-colors">Back to Fight Card</Link>
      </div>
    </div>
  )
}

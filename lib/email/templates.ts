// ─── Shared helpers ───────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cagepredict.com'

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CagePredict</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:28px;text-align:center;">
              <a href="${BASE_URL}" style="text-decoration:none;">
                <span style="display:inline-flex;align-items:center;gap:8px;">
                  <span style="display:inline-block;width:32px;height:32px;background:#ef4444;border-radius:8px;text-align:center;line-height:32px;font-size:16px;">🛡</span>
                  <span style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
                    Cage<span style="color:#ef4444;">Predict</span>
                  </span>
                </span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #262626;border-radius:16px;padding:32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#52525b;">
              <p style="margin:0;">
                You're receiving this because you have email notifications enabled.<br />
                <a href="${BASE_URL}/dashboard" style="color:#ef4444;text-decoration:none;">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}" style="color:#71717a;text-decoration:none;">CagePredict</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function primaryButton(text: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
    <tr>
      <td style="background:#ef4444;border-radius:10px;box-shadow:0 0 20px rgba(239,68,68,0.35);">
        <a href="${href}"
           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`
}

function statBox(label: string, value: string): string {
  return `<td style="background:#1a1a1a;border:1px solid #262626;border-radius:10px;padding:14px;text-align:center;width:33%;">
    <div style="font-size:22px;font-weight:900;color:#ffffff;">${value}</div>
    <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.8px;">${label}</div>
  </td>`
}

// ─── Welcome Email ───────────────────────────────────────────────────────────

export interface WelcomeData {
  displayName: string | null
  username: string
}

export function welcomeTemplate(data: WelcomeData): { subject: string; html: string } {
  const name = data.displayName ?? data.username

  const subject = `🥊 Welcome to CagePredict, ${name}!`

  const featureRow = (emoji: string, title: string, desc: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1f1f1f;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:36px;vertical-align:top;padding-top:2px;">
              <span style="font-size:18px;">${emoji}</span>
            </td>
            <td>
              <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff;">${title}</p>
              <p style="margin:2px 0 0;font-size:13px;color:#71717a;">${desc}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`

  const html = layout(`
    <!-- Hero -->
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:40px;margin-bottom:12px;">🛡️</div>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
        Welcome to CagePredict!
      </h1>
      <p style="margin:0;font-size:15px;color:#a1a1aa;">
        Hey ${name} — your account is verified and ready to go.
      </p>
    </div>

    <!-- Intro -->
    <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa;line-height:1.6;">
      CagePredict is the free UFC prediction game where you pick the winner of every fight,
      earn points for correct picks, and climb the global leaderboard. Here's everything
      you can do:
    </p>

    <!-- Feature list -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${featureRow('🎯', 'Pick every fight', 'Predict the winner before the event starts. Picks lock when the first bell rings.')}
      ${featureRow('🔒', 'Confidence lock', 'Mark one fight per card as your Lock for double points (20 pts instead of 10).')}
      ${featureRow('🔥', 'Streak bonuses', 'Build a win streak and earn bonus points — up to +20 pts per correct pick at 10 in a row.')}
      ${featureRow('🏆', 'Global leaderboard', 'Compete against every CagePredict user. Rank up from Amateur to UFC Champion.')}
      ${featureRow('👥', 'Crews', 'Create or join a crew and track who\'s winning each event within your group.')}
      ${featureRow('📊', 'Standings & stats', 'Browse fighter standings by weight class, head-to-head records, and community pick splits.')}
      ${featureRow('🏅', 'Badges', 'Unlock achievements like Perfect Card, Giant Killer, and On Fire as you play.')}
    </table>

    <!-- Points explainer -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1a1a1a;border:1px solid #262626;border-radius:12px;padding:16px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.8px;">
            How points work
          </p>
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr>
              <td style="font-size:13px;color:#a1a1aa;">✅ Correct pick</td>
              <td style="font-size:13px;font-weight:700;color:#f59e0b;text-align:right;">+10 pts</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a1a1aa;">🔒 Confidence lock (correct)</td>
              <td style="font-size:13px;font-weight:700;color:#f59e0b;text-align:right;">+20 pts</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a1a1aa;">🔥 3-fight streak bonus</td>
              <td style="font-size:13px;font-weight:700;color:#f59e0b;text-align:right;">+5 pts</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a1a1aa;">🔥🔥 5-fight streak bonus</td>
              <td style="font-size:13px;font-weight:700;color:#f59e0b;text-align:right;">+10 pts</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#a1a1aa;">🔥🔥🔥 10-fight streak bonus</td>
              <td style="font-size:13px;font-weight:700;color:#f59e0b;text-align:right;">+20 pts</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 4px;text-align:center;font-size:14px;color:#a1a1aa;">
      The next fight card is waiting for your picks.
    </p>

    ${primaryButton('Make My First Picks →', BASE_URL)}
  `)

  return { subject, html }
}

// ─── Card Live Email ──────────────────────────────────────────────────────────

export interface CardLiveData {
  eventName: string
  eventDate: string   // formatted e.g. "Saturday, May 3"
  fightCount: number
  mainEventFighter1: string
  mainEventFighter2: string
  slug: string
}

export function cardLiveTemplate(data: CardLiveData): { subject: string; html: string } {
  const subject = `🥊 ${data.eventName} is live — make your picks!`

  const html = layout(`
    <!-- Badge -->
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">
        🔴 CARD NOW LIVE
      </span>
    </div>

    <!-- Headline -->
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#ffffff;text-align:center;line-height:1.2;">
      ${data.eventName}
    </h1>
    <p style="margin:0 0 24px;text-align:center;color:#71717a;font-size:14px;">
      ${data.eventDate} · ${data.fightCount} fights
    </p>

    <!-- Main event matchup -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1a1a1a;border:1px solid #262626;border-radius:12px;padding:20px;text-align:center;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.8px;">Main Event</p>
          <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;">
            ${data.mainEventFighter1}
            <span style="color:#ef4444;font-size:14px;font-weight:400;margin:0 8px;">vs</span>
            ${data.mainEventFighter2}
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 4px;text-align:center;color:#a1a1aa;font-size:14px;">
      The fight card is live. Lock in your picks before the first bell.
    </p>
    <p style="margin:0;text-align:center;color:#71717a;font-size:13px;">
      Correct picks earn <strong style="color:#f59e0b;">10 pts</strong> — confidence picks earn <strong style="color:#f59e0b;">20 pts</strong>.
    </p>

    ${primaryButton('Make My Picks →', `${BASE_URL}/events/${data.slug}`)}
  `)

  return { subject, html }
}

// ─── Weekly Recap Email ───────────────────────────────────────────────────────

export interface WeeklyRecapData {
  username: string
  displayName: string | null
  pointsThisWeek: number
  totalPoints: number
  rank: number
  correctThisWeek: number
  totalPicksThisWeek: number
  bestPickFighter: string | null   // winner they picked correctly
  bestPickOpponent: string | null
  streak: number
}

export function weeklyRecapTemplate(data: WeeklyRecapData): { subject: string; html: string } {
  const name = data.displayName ?? data.username
  const winRate = data.totalPicksThisWeek > 0
    ? Math.round((data.correctThisWeek / data.totalPicksThisWeek) * 100)
    : 0

  const subject = data.pointsThisWeek > 0
    ? `🏆 You earned ${data.pointsThisWeek} pts this week, ${name}!`
    : `📊 Your CagePredict weekly recap`

  const html = layout(`
    <!-- Greeting -->
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#ffffff;">
      Weekly Recap 📊
    </h2>
    <p style="margin:0 0 24px;color:#71717a;font-size:14px;">
      Here's how you did this week, ${name}.
    </p>

    <!-- Stats row -->
    <table width="100%" cellpadding="6" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        ${statBox('Points earned', data.pointsThisWeek > 0 ? `+${data.pointsThisWeek}` : '0')}
        ${statBox('Win rate', `${winRate}%`)}
        ${statBox('Global rank', `#${data.rank}`)}
      </tr>
    </table>

    <!-- Record -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1a1a1a;border:1px solid #262626;border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.8px;">
            This week's record
          </p>
          <p style="margin:0;font-size:18px;font-weight:900;color:#ffffff;">
            <span style="color:#22c55e;">${data.correctThisWeek}W</span>
            &nbsp;–&nbsp;
            <span style="color:#ef4444;">${data.totalPicksThisWeek - data.correctThisWeek}L</span>
            &nbsp;
            <span style="font-size:13px;font-weight:400;color:#71717a;">from ${data.totalPicksThisWeek} picks</span>
          </p>
          ${data.streak >= 2 ? `
          <p style="margin:8px 0 0;font-size:13px;color:#f59e0b;">
            🔥 ${data.streak}-fight win streak — keep it up!
          </p>` : ''}
        </td>
      </tr>
    </table>

    <!-- Best pick -->
    ${data.bestPickFighter ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.8px;">
            ⭐ Best pick of the week
          </p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">
            ${data.bestPickFighter}
            <span style="font-size:13px;font-weight:400;color:#71717a;"> def. ${data.bestPickOpponent}</span>
          </p>
        </td>
      </tr>
    </table>` : ''}

    <!-- Totals -->
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;text-align:center;">
      Total points: <strong style="color:#f59e0b;">${data.totalPoints} pts</strong>
      &nbsp;·&nbsp;
      Global rank: <strong style="color:#ffffff;">#${data.rank}</strong>
    </p>

    ${primaryButton('View Leaderboard →', `${BASE_URL}/leaderboard`)}
  `)

  return { subject, html }
}

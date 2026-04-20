import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CagePredict — Predict. Compete. Climb the Rankings.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #09090b 0%, #18181b 60%, #27272a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Red glow accent */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 300,
            background: 'radial-gradient(ellipse, rgba(239,68,68,0.18) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              background: '#ef4444',
              borderRadius: 16,
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
            }}
          >
            ⚔️
          </div>
          <span style={{ fontSize: 48, fontWeight: 900, color: '#ffffff', letterSpacing: -2 }}>
            CagePredict
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: '#a1a1aa',
            fontWeight: 500,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Predict · Compete · Climb the Rankings
        </div>

        {/* Sub-label */}
        <div
          style={{
            marginTop: 24,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 999,
            padding: '8px 24px',
            color: '#f87171',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          Free to Play · UFC Fantasy Predictions
        </div>
      </div>
    ),
    { ...size },
  )
}

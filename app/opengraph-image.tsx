import { ImageResponse } from 'next/og'

// Next.js reads these metadata exports from the generated image route.
// oxlint-disable-next-line react/only-export-components
export const alt =
  'AI Liquid Sculpture — an interactive fire-toned generative particle experience'
// oxlint-disable-next-line react/only-export-components
export const size = { width: 1200, height: 630 }
// oxlint-disable-next-line react/only-export-components
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#080807',
          color: '#f8eee2',
          display: 'flex',
          height: '100%',
          justifyContent: 'space-between',
          overflow: 'hidden',
          padding: '72px',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(247, 88, 23, 0.46), rgba(155, 42, 12, 0.18) 42%, transparent 72%)',
            borderRadius: '50%',
            height: '760px',
            position: 'absolute',
            right: '-90px',
            top: '-80px',
            width: '760px',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '670px',
            position: 'relative',
          }}
        >
          <div
            style={{
              color: '#ffb36b',
              fontSize: '19px',
              fontWeight: 600,
              letterSpacing: '5px',
              marginBottom: '34px',
            }}
          >
            INTERACTIVE GENERATIVE ART
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Georgia, serif',
              fontSize: '80px',
              letterSpacing: '-3px',
              lineHeight: 1.05,
            }}
          >
            <div>AI Liquid</div>
            <div>Sculpture</div>
          </div>
          <div
            style={{
              color: '#c4b9ae',
              fontSize: '25px',
              lineHeight: 1.4,
              marginTop: '28px',
              maxWidth: '640px',
            }}
          >
            A living field of particles, shaped by conversation.
          </div>
          <div
            style={{
              border: '1px solid rgba(255, 179, 107, 0.36)',
              borderRadius: '999px',
              color: '#f8c18d',
              fontSize: '18px',
              marginTop: '38px',
              padding: '12px 20px',
              alignSelf: 'flex-start',
            }}
          >
            BY DEVELOPERKASHIF
          </div>
        </div>
        <div
          style={{
            background:
              'radial-gradient(circle at 38% 35%, #ffda9d 0%, #ff8a36 13%, #bb3b12 33%, rgba(75, 20, 8, 0.74) 52%, transparent 72%)',
            borderRadius: '50%',
            boxShadow: '0 0 95px rgba(244, 83, 21, 0.26)',
            height: '430px',
            position: 'absolute',
            right: '48px',
            top: '96px',
            width: '430px',
          }}
        />
        <div
          style={{
            border: '1px solid rgba(255, 182, 107, 0.2)',
            borderRadius: '50%',
            height: '520px',
            position: 'absolute',
            right: '5px',
            top: '50px',
            width: '520px',
          }}
        />
      </div>
    ),
    size,
  )
}

'use client'

import { useState } from 'react'
import ChatAssistant from './ChatAssistant'
import Sculpture from './Sculpture'
import type { SculptureVisualState } from './chatTypes'

const defaultVisualState: SculptureVisualState = {
  primaryColor: '#8f260b',
  secondaryColor: '#f56316',
  highlightColor: '#ffd08a',
  energy: 0.55,
  spin: 0,
  waveSpeed: 1,
  waveFrequency: 3.2,
  particleSize: 2.7,
  turbulence: 0.38,
}

type AppProps = {
  googleSignInEnabled: boolean
}

export default function App({ googleSignInEnabled }: AppProps) {
  const [dark, setDark] = useState(true)
  const [visualState, setVisualState] = useState<SculptureVisualState>(defaultVisualState)

  return (
    <main className={`page ${dark ? 'theme-dark' : 'theme-light'}`}>
      <h1 className="visually-hidden">AI Liquid Sculpture — Interactive Generative Art</h1>
      <section className="hero" aria-label="Interactive AI liquid sculpture">
        <div className="hero-art" aria-hidden="true">
          <Sculpture dark={dark} visualState={visualState} />
        </div>

        <header className="site-header">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.2 15.3A8.7 8.7 0 0 1 8.7 3.8 8.8 8.8 0 1 0 20.2 15.3Z" />
              </svg>
            )}
          </button>
          <a className="contact-link" href="/support">Contact</a>
        </header>

        <ChatAssistant
          onVisualStateChange={setVisualState}
          googleSignInEnabled={googleSignInEnabled}
          initialOpen
        />
        <a className="credit" href="/support">by developerkashif</a>
      </section>
    </main>
  )
}

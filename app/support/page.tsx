import Link from 'next/link'
import type { Metadata } from 'next'

const supportEmail = 'kashif324441@gmail.com'

export const metadata: Metadata = {
  title: 'AI Assistant Support',
  description:
    'Get help with the AI Liquid Sculpture assistant. Learn what details to share and contact Developer Kashif by email.',
  alternates: { canonical: '/support' },
}

export default function SupportPage() {
  return (
    <main className="support-page">
      <Link className="support-back" href="/" aria-label="Return to the sculpture">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        <span>Back to the sculpture</span>
      </Link>

      <section className="support-content">
        <p className="support-eyebrow">Human support · Always welcome</p>
        <h1 className="support-title">
          When the unexpected<br />
          <span>needs a human.</span>
        </h1>
        <p className="support-intro">
          If your AI assistant is having trouble or something does not look right,
          follow these steps and get in touch. We will be glad to help.
        </p>

        <div className="support-graph" aria-label="Steps for contacting AI support">
          <div className="graph-line" aria-hidden="true"><span /></div>
          <article className="support-step">
            <span className="step-node">01</span>
            <div>
              <h2>Describe what happened</h2>
              <p>Tell us what you were trying to do and what the assistant did instead.</p>
            </div>
          </article>
          <article className="support-step">
            <span className="step-node">02</span>
            <div>
              <h2>Add useful context</h2>
              <p>Include the approximate time, your browser, and a screenshot if helpful.</p>
            </div>
          </article>
          <article className="support-step">
            <span className="step-node">03</span>
            <div>
              <h2>Send us a message</h2>
              <p>We will review your note and reply as soon as we can.</p>
            </div>
          </article>
        </div>

        <a
          className="support-email"
          href={`mailto:${supportEmail}?subject=${encodeURIComponent('AI assistant support')}`}
        >
          <span>Email AI support</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </a>

        <p className="support-safety">
          For your security, never include API keys, passwords, or other private credentials in an email.
        </p>
      </section>
      <span className="support-watermark" aria-hidden="true">AI</span>
    </main>
  )
}

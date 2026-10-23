'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isRegistrationPasswordValid } from '../lib/passwordRules'

type AuthPanelProps = {
  googleSignInEnabled: boolean
}

export default function AuthPanel({ googleSignInEnabled }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (
      mode === 'register'
      && !isRegistrationPasswordValid(password)
    ) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setBusy(true)
    setError('')
    let requestPhase: 'registration' | 'sign-in' = mode === 'register' ? 'registration' : 'sign-in'

    try {
      if (mode === 'register') {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })
        const responseText = await response.text()
        let result: unknown
        try {
          result = JSON.parse(responseText)
        } catch {
          result = responseText
        }

        if (!response.ok) {
          console.error('[Account registration] Backend response:', {
            status: response.status,
            body: result,
          })
          const message = typeof result === 'object' && result !== null && 'error' in result
            ? String(result.error)
            : 'Unable to create your account. Please try again.'
          throw new Error(message)
        }
      }

      requestPhase = 'sign-in'
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (!result || result.error) {
        if (mode === 'register') {
          console.error('[Account registration] Follow-up sign-in response:', result)
        }
        throw new Error(
          mode === 'register'
            ? 'Your account was created, but sign-in did not complete. Please sign in.'
            : 'Email or password is incorrect.',
        )
      }

      setPassword('')
    } catch (caught) {
      const isFetchError = caught instanceof TypeError && /fetch/i.test(caught.message)
      setError(
        isFetchError
          ? requestPhase === 'registration'
            ? 'Could not reach the account registration service. Check the site connection and try again.'
            : 'Your account may be ready, but the sign-in service could not be reached. Please try signing in again.'
          : caught instanceof Error
            ? caught.message
            : 'Authentication failed. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function continueWithGoogle() {
    if (busy) return
    setBusy(true)
    setError('')

    try {
      await signIn('google', { callbackUrl: window.location.href })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in could not start.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-intro">
        <p className="chat-kicker">A little intelligence, a lot of imagination.</p>
        <h2>Please Login to Chat</h2>
        <p>Sign in to start a conversation and let the sculpture respond.</p>
      </div>

      {googleSignInEnabled && (
        <>
          <button
            className="auth-google"
            type="button"
            disabled={busy}
            onClick={() => void continueWithGoogle()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.24a4.48 4.48 0 0 1-1.95 2.94v2.44h3.15c1.84-1.69 2.91-4.18 2.91-7.22Z" />
              <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.35l-3.15-2.44c-.87.58-1.98.93-3.3.93-2.54 0-4.7-1.71-5.47-4.02H3.28v2.51A9.74 9.74 0 0 0 12 21.75Z" />
              <path fill="#FBBC05" d="M6.53 13.87a5.85 5.85 0 0 1 0-3.74V7.62H3.28a9.75 9.75 0 0 0 0 8.76l3.25-2.51Z" />
              <path fill="#EA4335" d="M12 6.11c1.43 0 2.71.49 3.72 1.47l2.79-2.79C16.83 3.19 14.63 2.25 12 2.25a9.74 9.74 0 0 0-8.72 5.37l3.25 2.51C7.3 7.82 9.46 6.11 12 6.11Z" />
            </svg>
            Continue with Google
          </button>
          <div className="auth-divider"><span>or with email</span></div>
        </>
      )}

      <form className="auth-form" onSubmit={submit}>
        {mode === 'register' && (
          <label>
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              minLength={2}
              maxLength={60}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label>
          <span>Email address</span>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'register'
              ? 'Create account'
              : 'Sign in with email'}
        </button>
      </form>

      <p className="auth-switch">
        {mode === 'register' ? 'Already have an account?' : 'New here?'}
        {' '}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode((current) => current === 'register' ? 'sign-in' : 'register')
            setError('')
          }}
        >
          {mode === 'register' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  )
}

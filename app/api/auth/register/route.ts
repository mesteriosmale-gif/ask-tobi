import { NextResponse } from 'next/server'
import connectToDatabase, { mongoUri } from '../../../../lib/mongodb'
import { hashPassword } from '../../../../lib/password'
import { isRegistrationPasswordValid } from '../../../../lib/passwordRules'
import User from '../../../../models/User'

export const runtime = 'nodejs'

const attemptsByAddress = new Map<string, { count: number; resetAt: number }>()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function allowRegistration(address: string): boolean {
  const now = Date.now()
  if (attemptsByAddress.size > 1_000) {
    for (const [key, value] of attemptsByAddress) {
      if (value.resetAt <= now) attemptsByAddress.delete(key)
    }
  }

  const current = attemptsByAddress.get(address)
  if (!current || current.resetAt <= now) {
    attemptsByAddress.set(address, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (current.count >= 5) return false
  current.count += 1
  return true
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || request.headers.get('host')
  if (!origin || !host) {
    return NextResponse.json({ error: 'This request could not be accepted.' }, { status: 403 })
  }
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: 'This request could not be accepted.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'This request could not be accepted.' }, { status: 403 })
  }

  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!allowRegistration(address)) {
    return NextResponse.json(
      { error: 'Too many account attempts. Please wait a minute and try again.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 256_000) {
      return NextResponse.json({ error: 'The account details are too long.' }, { status: 413 })
    }
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Please provide valid account details.' }, { status: 400 })
  }

  if (
    typeof body !== 'object'
    || body === null
    || !('name' in body)
    || typeof body.name !== 'string'
    || !('email' in body)
    || typeof body.email !== 'string'
    || !('password' in body)
    || typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'Please provide valid account details.' }, { status: 400 })
  }

  const name = body.name.trim()
  const email = body.email.trim().toLowerCase()
  const password = body.password

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: 'Name must be between 2 and 60 characters.' }, { status: 400 })
  }
  if (email.length > 254 || !emailPattern.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!isRegistrationPasswordValid(password)) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters long.' },
      { status: 400 },
    )
  }

  if (!mongoUri) {
    return NextResponse.json(
      {
        error:
          'Account setup is incomplete: the server needs MONGODB_URI or MONGODB_URL. Ask the site administrator to finish authentication setup.',
      },
      { status: 503 },
    )
  }

  let registrationStep = 'connecting to the database'
  try {
    await connectToDatabase()
    registrationStep = 'hashing the password'
    const passwordHash = await hashPassword(password)
    registrationStep = 'checking for an existing account'
    const existingUser = await User.exists({ email })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Could not create this account. Try signing in instead.' },
        { status: 409 },
      )
    }

    registrationStep = 'saving the account'
    const user = await User.create({ name, email, passwordHash })
    return NextResponse.json({ userId: user._id.toString() }, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown registration error'
    const safeErrorMessage = errorMessage
      .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, 'mongodb://[redacted]')
      .slice(0, 500)
    console.error('Account registration failed:', {
      step: registrationStep,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode:
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined,
      details: safeErrorMessage,
    })

    if (isDuplicateEmail(error)) {
      return NextResponse.json(
        { error: 'Could not create this account. Try signing in instead.' },
        { status: 409 },
      )
    }

    return NextResponse.json(
      {
        error: 'Account registration could not be completed.',
        details: `Failed while ${registrationStep}: ${safeErrorMessage}`,
      },
      { status: 503 },
    )
  }
}

function isDuplicateEmail(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  if ('code' in error && error.code === 11000) return true

  return 'message' in error
    && typeof error.message === 'string'
    && error.message.includes('E11000')
}

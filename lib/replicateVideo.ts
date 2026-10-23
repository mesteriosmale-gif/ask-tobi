import { createHmac, timingSafeEqual } from 'node:crypto'

const REPLICATE_API_BASE = 'https://api.replicate.com/v1'

export type VideoPrediction = {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: unknown
  error?: unknown
}

function getReplicateKey(): string | undefined {
  const key = process.env.REPLICATE_API_KEY?.trim()
  return key && !/^(your|paste|insert|replace|<)/i.test(key) && !/_here$/i.test(key)
    ? key
    : undefined
}

function getJobSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Video job signing is not configured.')
  return secret
}

export function signVideoJob(userId: string, predictionId: string): string {
  return createHmac('sha256', getJobSecret())
    .update(`${userId}:${predictionId}`)
    .digest('hex')
}

export function verifyVideoJob(userId: string, predictionId: string, token: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(token)) return false
  const expected = Buffer.from(signVideoJob(userId, predictionId), 'hex')
  const supplied = Buffer.from(token, 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export function isReplicateDeliveryUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (url.hostname === 'replicate.delivery' || url.hostname.endsWith('.replicate.delivery'))
  } catch {
    return false
  }
}

export async function createVideoPrediction(prompt: string): Promise<VideoPrediction> {
  const key = getReplicateKey()
  if (!key) throw new Error('Replicate video generation is not configured.')

  const response = await fetch(`${REPLICATE_API_BASE}/models/minimax/video-01/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=1',
    },
    body: JSON.stringify({
      input: {
        prompt: `Create a cinematic 6-second video at 720p and 25 fps. ${prompt}`,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })

  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Replicate video request failed with status ${response.status}.`)
  }
  if (
    typeof result !== 'object'
    || result === null
    || !('id' in result)
    || typeof result.id !== 'string'
    || !('status' in result)
    || !isVideoStatus(result.status)
  ) {
    throw new Error('Replicate returned an invalid video job.')
  }

  return result as VideoPrediction
}

export async function getVideoPrediction(predictionId: string): Promise<VideoPrediction> {
  const key = getReplicateKey()
  if (!key) throw new Error('Replicate video generation is not configured.')

  const response = await fetch(`${REPLICATE_API_BASE}/predictions/${encodeURIComponent(predictionId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Replicate video status request failed with status ${response.status}.`)
  }
  if (
    typeof result !== 'object'
    || result === null
    || !('id' in result)
    || result.id !== predictionId
    || !('status' in result)
    || !isVideoStatus(result.status)
  ) {
    throw new Error('Replicate returned an invalid video status.')
  }

  return result as VideoPrediction
}

export function getReplicateOutputUrl(output: unknown): string | undefined {
  const candidate = Array.isArray(output) ? output[0] : output
  return typeof candidate === 'string' && isReplicateDeliveryUrl(candidate)
    ? candidate
    : undefined
}

function isVideoStatus(value: unknown): value is VideoPrediction['status'] {
  return value === 'starting'
    || value === 'processing'
    || value === 'succeeded'
    || value === 'failed'
    || value === 'canceled'
}

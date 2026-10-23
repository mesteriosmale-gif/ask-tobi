import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import connectToDatabase from '../../../../lib/mongodb'
import Chat from '../../../../models/Chat'
import {
  getReplicateOutputUrl,
  getVideoPrediction,
  isReplicateDeliveryUrl,
  verifyVideoJob,
} from '../../../../lib/replicateVideo'

export const runtime = 'nodejs'

const MAX_VIDEO_BYTES = 100_000_000

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to access this video.' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const predictionId = params.get('id') ?? ''
  const token = params.get('token') ?? ''
  if (
    !/^[a-f\d-]{16,80}$/i.test(predictionId)
    || !verifyVideoJob(session.user.id, predictionId, token)
  ) {
    return NextResponse.json({ error: 'Video job not found.' }, { status: 404 })
  }

  try {
    const prediction = await getVideoPrediction(predictionId)
    if (prediction.status !== 'succeeded') {
      return NextResponse.json({ status: prediction.status })
    }

    const videoUrl = getReplicateOutputUrl(prediction.output)
    if (!videoUrl) {
      console.error('Replicate returned an invalid video output URL.')
      return NextResponse.json(
        { status: 'failed', message: 'The video service returned an invalid result.' },
        { status: 502 },
      )
    }

    const download = params.get('download') === '1'
    if (!download && params.get('stream') !== '1') {
      return NextResponse.json({ status: 'succeeded', videoUrl })
    }

    if (!isReplicateDeliveryUrl(videoUrl)) {
      return NextResponse.json({ error: 'Video not found.' }, { status: 404 })
    }
    const response = await fetch(videoUrl, {
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    })
    const contentLength = Number(response.headers.get('content-length'))
    if (
      !response.ok
      || !response.headers.get('content-type')?.toLowerCase().startsWith('video/')
      || (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES)
      || !response.body
    ) {
      return NextResponse.json({ error: 'The video download could not be prepared.' }, { status: 502 })
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_VIDEO_BYTES) {
        await reader.cancel()
        return NextResponse.json({ error: 'The video is too large to download.' }, { status: 413 })
      }
      chunks.push(value)
    }

    const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(data.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="tobi-video-720p.mp4"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Loading Replicate video failed.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json(
      { error: 'The video could not be loaded right now. Please try again.' },
      { status: 502 },
    )
  }
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to save this video.' }, { status: 401 })
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 4_000) return NextResponse.json({ error: 'Invalid video update.' }, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid video update.' }, { status: 400 })
  }
  if (
    typeof body !== 'object'
    || body === null
    || !('id' in body) || typeof body.id !== 'string'
    || !('token' in body) || typeof body.token !== 'string'
    || !('threadId' in body) || typeof body.threadId !== 'string'
    || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.threadId)
    || !('status' in body)
    || !['succeeded', 'failed', 'canceled'].includes(String(body.status))
    || !verifyVideoJob(session.user.id, body.id, body.token)
    || ('videoUrl' in body && (typeof body.videoUrl !== 'string' || !isReplicateDeliveryUrl(body.videoUrl)))
  ) {
    return NextResponse.json({ error: 'Invalid video update.' }, { status: 400 })
  }

  try {
    await connectToDatabase()
    const update: Record<string, string> = {
      'messages.$.videoStatus': body.status as string,
    }
    if ('videoUrl' in body && typeof body.videoUrl === 'string') {
      update['messages.$.videoUrl'] = body.videoUrl
    }
    const chat = await Chat.findOneAndUpdate(
      {
        userId: session.user.id,
        threadId: body.threadId,
        'messages.videoJobId': body.id,
        'messages.videoJobToken': body.token,
      },
      { $set: update },
      { new: true, projection: { _id: 1 } },
    ).lean()
    if (!chat) return NextResponse.json({ error: 'Video job not found.' }, { status: 404 })
    return NextResponse.json({ saved: true })
  } catch (error) {
    console.error('Saving generated video status failed.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'The video could not be saved to chat history.' }, { status: 503 })
  }
}

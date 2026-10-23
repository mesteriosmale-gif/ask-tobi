import { isValidObjectId } from 'mongoose'
import mongoose from 'mongoose'
import { GridFSBucket } from 'mongodb'
import { NextResponse } from 'next/server'
import { auth } from '../../../../../auth'
import connectToDatabase from '../../../../../lib/mongodb'
import GeneratedImage from '../../../../../models/GeneratedImage'

export const runtime = 'nodejs'
const MAX_IMAGE_BYTES = 40_000_000

type RouteContext = {
  params: Promise<{ imageId: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to access this image.' }, { status: 401 })
  }

  const { imageId } = await params
  if (!isValidObjectId(imageId)) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  try {
    await connectToDatabase()
    const image = await GeneratedImage.findOne({ _id: imageId, userId: session.user.id })
      .select({ data: 1, mimeType: 1, gridFsId: 1, imageUrl: 1 })
      .lean()

    if (!image) {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    }

    if (image.imageUrl) {
      const imageUrl = new URL(image.imageUrl)
      if (
        imageUrl.origin !== 'https://image.pollinations.ai'
        && imageUrl.origin !== 'https://gen.pollinations.ai'
      ) {
        return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
      }
      if (imageUrl.origin === 'https://image.pollinations.ai') {
        return NextResponse.redirect(imageUrl)
      }

      const apiKey = process.env.POLLINATIONS_API_KEY?.trim()
        || process.env.POLLINATION_API_KEY?.trim()
      if (!apiKey) {
        return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
      }
      const response = await fetch(imageUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(55_000),
        redirect: 'error',
      })
      const mimeType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase()
      if (
        !response.ok
        || !mimeType
        || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)
      ) {
        return NextResponse.json({ error: 'The image could not be loaded.' }, { status: 502 })
      }
      const data = await readResponseBody(response, MAX_IMAGE_BYTES)
      if (!data) {
        return NextResponse.json({ error: 'The image is too large to load.' }, { status: 413 })
      }
      const download = new URL(request.url).searchParams.get('download') === '1'
      return new NextResponse(data, {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(data.byteLength),
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="tobi-generated-image.${extensionFor(mimeType)}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    if (!image.mimeType) {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    }

    let data: Buffer
    if (image.data) {
      data = Buffer.from(image.data)
    } else if (image.gridFsId) {
      const database = mongoose.connection.db
      if (!database) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
      const bucket = new GridFSBucket(database, { bucketName: 'generated_image_files' })
      const file = await database.collection('generated_image_files.files')
        .findOne({ _id: image.gridFsId }, { projection: { length: 1 } })
      if (!file || typeof file.length !== 'number' || file.length > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
      }
      const chunks: Buffer[] = []
      let totalBytes = 0
      for await (const chunk of bucket.openDownloadStream(image.gridFsId)) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += bytes.byteLength
        if (totalBytes > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: 'The image is too large to load.' }, { status: 413 })
        }
        chunks.push(bytes)
      }
      data = Buffer.concat(chunks)
    } else {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    }
    const download = new URL(request.url).searchParams.get('download') === '1'
    return new NextResponse(data, {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(data.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="tobi-generated-image.${extensionFor(image.mimeType)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error(
      'Loading generated image failed:',
      error instanceof Error ? error.message : 'Unknown database error',
    )
    return NextResponse.json({ error: 'The image could not be loaded.' }, { status: 503 })
  }
}

async function readResponseBody(response: Response, limit: number): Promise<Buffer | null> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}
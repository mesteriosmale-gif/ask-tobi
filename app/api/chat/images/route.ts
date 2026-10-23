import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import connectToDatabase from '../../../../lib/mongodb'
import GeneratedImage from '../../../../models/GeneratedImage'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to view your library.' }, { status: 401 })
  }

  try {
    await connectToDatabase()
    const images = await GeneratedImage.find({ userId: session.user.id })
      .select({ prompt: 1, mimeType: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    return NextResponse.json({
      images: images.map((image) => ({
        id: image._id.toString(),
        prompt: image.prompt,
        mimeType: image.mimeType,
        createdAt: image.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error(
      'Loading generated image library failed:',
      error instanceof Error ? error.message : 'Unknown database error',
    )
    return NextResponse.json({ error: 'Your image library could not be loaded.' }, { status: 503 })
  }
}

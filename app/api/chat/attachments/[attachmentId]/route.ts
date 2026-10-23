import { isValidObjectId } from 'mongoose'
import { NextResponse } from 'next/server'
import { auth } from '../../../../../auth'
import connectToDatabase from '../../../../../lib/mongodb'
import ChatAttachment from '../../../../../models/ChatAttachment'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ attachmentId: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to access this attachment.' }, { status: 401 })
  }

  const { attachmentId } = await params
  if (!isValidObjectId(attachmentId)) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  }

  try {
    await connectToDatabase()
    const attachment = await ChatAttachment.findOne({
      _id: attachmentId,
      userId: session.user.id,
    })
      .select({ data: 1, mimeType: 1, name: 1 })
      .lean()

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    }

    const data = Buffer.from(attachment.data)
    const inline = new URL(request.url).searchParams.get('inline') === '1'
    const safeName = attachment.name.replace(/[\r\n"]/g, '_')
    return new NextResponse(data, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(data.byteLength),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error(
      'Loading chat attachment failed:',
      error instanceof Error ? error.message : 'Unknown database error',
    )
    return NextResponse.json({ error: 'The attachment could not be loaded.' }, { status: 503 })
  }
}

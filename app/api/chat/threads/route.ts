import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import connectToDatabase from '../../../../lib/mongodb'
import Chat from '../../../../models/Chat'
import type { ChatThread } from '../../../../src/chatTypes'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to view recent chats.' }, { status: 401 })
  }

  try {
    await connectToDatabase()
    const threads = await Chat.aggregate<{
      _id: string
      title?: string
      updatedAt: Date
    }>([
      { $match: { userId: session.user.id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: { $ifNull: ['$threadId', 'legacy'] },
          title: { $first: '$title' },
          updatedAt: { $first: '$timestamp' },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: 100 },
    ])

    const response: ChatThread[] = threads.map((thread) => ({
      id: thread._id,
      title: thread.title?.trim() || 'Previous conversation',
      updatedAt: thread.updatedAt.toISOString(),
    }))

    return NextResponse.json({ threads: response })
  } catch (error) {
    console.error(
      'Loading recent chat threads failed:',
      error instanceof Error ? error.message : 'Unknown database error',
    )
    return NextResponse.json({ error: 'Recent chats are unavailable right now.' }, { status: 503 })
  }
}

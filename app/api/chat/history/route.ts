import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import connectToDatabase from '../../../../lib/mongodb'
import Chat from '../../../../models/Chat'
import ChatAttachment from '../../../../models/ChatAttachment'
import type { ChatMessage } from '../../../../src/chatTypes'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to view chat history.' }, { status: 401 })
  }

  try {
    await connectToDatabase()
    const requestedThread = new URL(request.url).searchParams.get('threadId')
    const latestConversation = requestedThread
      ? null
      : await Chat.findOne({ userId: session.user.id }).sort({ timestamp: -1 }).select({ threadId: 1 }).lean()
    const threadId = requestedThread || latestConversation?.threadId || 'legacy'
    const threadFilter = threadId === 'legacy'
      ? { userId: session.user.id, $or: [{ threadId: 'legacy' }, { threadId: { $exists: false } }] }
      : { userId: session.user.id, threadId }

    const conversations = await Chat.find(threadFilter)
      .select({ messages: 1 })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean()

    const reversedConversations = conversations.reverse()
    const attachmentIds = reversedConversations.flatMap((conversation) =>
      conversation.messages.flatMap((message) => message.attachmentIds ?? []),
    )
    const attachments = attachmentIds.length
      ? await ChatAttachment.find({ _id: { $in: attachmentIds }, userId: session.user.id })
        .select({ name: 1, mimeType: 1, size: 1 })
        .lean()
      : []
    const attachmentMetadata = new Map(
      attachments.map((attachment) => [
        attachment._id.toString(),
        {
          id: attachment._id.toString(),
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
        },
      ]),
    )
    const messages: ChatMessage[] = reversedConversations.flatMap((conversation) =>
      conversation.messages.map(({
        role,
        content,
        imageId,
        imageUrl,
        imageResolution,
        projectFiles,
        videoJobId,
        videoJobToken,
        videoStatus,
        videoUrl,
        attachmentIds: ids,
      }) => ({
        role,
        content,
        ...(imageId ? { imageId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(imageResolution ? { imageResolution } : {}),
        ...(projectFiles?.length ? { projectFiles } : {}),
        ...(videoJobId ? { videoJobId } : {}),
        ...(videoJobToken ? { videoJobToken } : {}),
        ...(videoStatus ? { videoStatus } : {}),
        ...(videoUrl ? { videoUrl } : {}),
        ...(ids?.length
          ? {
              attachments: ids
                .map((id) => attachmentMetadata.get(id.toString()))
                .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment)),
            }
          : {}),
      })),
    )

    return NextResponse.json({ messages, threadId })
  } catch (error) {
    console.error(
      'Loading MongoDB chat history failed:',
      error instanceof Error ? error.message : 'Unknown database error',
    )
    return NextResponse.json(
      { error: 'Your chat history is unavailable right now. Please try again.' },
      { status: 503 },
    )
  }
}

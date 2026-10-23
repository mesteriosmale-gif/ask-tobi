import mongoose, { Schema } from 'mongoose'
import type { Model, Types } from 'mongoose'
import type { ProjectFile } from '../src/chatTypes'

export type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  imageId?: string
  imageUrl?: string
  imageResolution?: 'standard' | '2k' | '4k' | '8k'
  projectFiles?: ProjectFile[]
  videoJobId?: string
  videoJobToken?: string
  videoStatus?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  videoUrl?: string
  attachmentIds?: Types.ObjectId[]
}

export type ChatDocument = {
  userId: Types.ObjectId
  threadId: string
  title: string
  model: string
  messages: StoredMessage[]
  timestamp: Date
}

const hasChatMessages = (messages: StoredMessage[]) => messages.length >= 1 && messages.length <= 2

const ChatSchema = new Schema<ChatDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    threadId: { type: String, required: true, default: 'legacy', index: true },
    title: { type: String, required: true, maxlength: 120 },
    model: { type: String, required: true, default: 'medium' },
    messages: {
      type: [
        new Schema<StoredMessage>(
          {
            role: { type: String, enum: ['user', 'assistant'], required: true },
            content: { type: String, required: true, maxlength: 60_000 },
            imageId: { type: String },
            imageResolution: {
              type: String,
              enum: ['standard', '2k', '4k', '8k'],
              required: false,
            },
            imageUrl: {
              type: String,
              required: false,
              maxlength: 7_000,
              validate: {
                validator: (value: string | undefined) =>
                  !value || /^https:\/\/(?:image\.pollinations\.ai\/prompt\/|gen\.pollinations\.ai\/image\/)/.test(value),
                message: 'Generated image URLs must use the configured image service.',
              },
            },
            projectFiles: {
              type: [{
                path: { type: String, required: true, maxlength: 180 },
                content: { type: String, required: true, maxlength: 40_000 },
              }],
              required: false,
              validate: {
                validator: (files: ProjectFile[] | undefined) => !files || files.length <= 12,
                message: 'A project can contain no more than 12 files.',
              },
            },
            videoJobId: { type: String, required: false, maxlength: 100 },
            videoJobToken: { type: String, required: false, maxlength: 200 },
            videoStatus: {
              type: String,
              enum: ['starting', 'processing', 'succeeded', 'failed', 'canceled'],
              required: false,
            },
            videoUrl: {
              type: String,
              required: false,
              maxlength: 7_000,
              validate: {
                validator: (value: string | undefined) =>
                  !value || /^https:\/\/(?:[^/]+\.)?replicate\.delivery\//.test(value),
                message: 'Generated video URLs must use Replicate delivery.',
              },
            },
            attachmentIds: [{ type: Schema.Types.ObjectId, ref: 'ChatAttachment' }],
          },
          { _id: false },
        ),
      ],
      required: true,
      validate: {
        validator: hasChatMessages,
        message: 'Chat entries can contain one user message and an optional assistant response.',
      },
    },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { collection: 'chats', timestamps: false },
)

ChatSchema.index({ userId: 1, threadId: 1, timestamp: -1 })

const Chat: Model<ChatDocument> =
  mongoose.models.Chat as Model<ChatDocument> || mongoose.model<ChatDocument>('Chat', ChatSchema)

export default Chat

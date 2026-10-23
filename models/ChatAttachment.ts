import mongoose, { Schema } from 'mongoose'
import { Buffer } from 'node:buffer'
import type { Document, Model, Types } from 'mongoose'

export interface ChatAttachmentDocument extends Document {
  userId: Types.ObjectId
  threadId: string
  name: string
  mimeType: string
  size: number
  data: Buffer
  createdAt: Date
}

const ChatAttachmentSchema = new Schema<ChatAttachmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    threadId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 1, max: 2_000_000 },
    data: { type: Buffer, required: true },
  },
  { collection: 'chat_attachments', timestamps: { createdAt: true, updatedAt: false } },
)

ChatAttachmentSchema.index({ userId: 1, threadId: 1, createdAt: -1 })

const ChatAttachment: Model<ChatAttachmentDocument> =
  mongoose.models.ChatAttachment as Model<ChatAttachmentDocument>
  || mongoose.model<ChatAttachmentDocument>('ChatAttachment', ChatAttachmentSchema)

export default ChatAttachment
